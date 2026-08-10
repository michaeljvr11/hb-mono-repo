import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CurrencyCode, CurrencyTotalDto, OrderStatus, PaymentStatus } from '@hb/shared';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Payment } from '../payments/entities/payment.entity';
import { DAMAGE_CLAIM_WINDOW_HOURS, SETTLEMENT_ANCHOR_DATE } from './earnings.constants';

const PERIOD_LENGTH_MS = 14 * 24 * 60 * 60 * 1000; // bi-weekly

/** One CLOSED bi-weekly settlement-batch-equivalent period (entirely in the past). */
export interface SettlementPeriodSnapshot {
  periodStart: Date;
  /** Exclusive — the next period's periodStart. */
  periodEnd: Date;
  /** Distinct orders contributing to this period, within the requested scope. */
  orderCount: number;
  netByCurrency: CurrencyTotalDto[];
}

/**
 * Payout-eligibility earnings snapshot for a vendor scope (platform-wide
 * across all vendors when `vendorId` is omitted, or one vendor's own lines)
 * over a date range — see "Vendor Earnings & Commission" (vault). Three
 * buckets, all net-of-commission (gross − commission):
 *
 * - `pendingClaimWindow`: order is `delivered` but the 48h damage-claim
 *   window has not yet elapsed.
 * - `accrued`: eligible (window elapsed) lines whose bi-weekly settlement
 *   period (anchored at `SETTLEMENT_ANCHOR_DATE`) is the CURRENT open period.
 * - `settlementPreview`: eligible lines grouped into CLOSED bi-weekly
 *   periods (entirely in the past relative to `now`).
 *
 * Cancelled orders and any order with a `refunded` payment are excluded from
 * every bucket, including `pendingClaimWindow`. ZAR/NAD are never summed —
 * every currency gets its own `CurrencyTotalDto` entry, and only currencies
 * with at least one contributing line appear.
 */
export interface VendorEarningsSnapshot {
  pendingClaimWindow: CurrencyTotalDto[];
  accrued: CurrencyTotalDto[];
  settlementPreview: SettlementPeriodSnapshot[];
}

/**
 * Per-currency money breakdown exposing BOTH commission and net —
 * `getEarnings()`'s `VendorEarningsSnapshot` only keeps net (VE-3 didn't
 * need commission). VE-4's cross-vendor admin report needs the commission
 * side too: "platform revenue = sum of commission on eligible lines" (vault).
 * No `grossAmount` field here on purpose — callers derive gross as
 * `commissionAmount + netAmount`, never independently computed, per the
 * vault's "commission + net === gross" invariant.
 */
export interface VendorEarningsCurrencyBreakdown {
  currency: CurrencyCode;
  commissionAmount: number;
  netAmount: number;
}

/** One earnings bucket (pendingClaimWindow or accrued) for one vendor. */
export interface VendorEarningsBucketBreakdown {
  /** Distinct orders contributing to this bucket for this vendor. */
  orderCount: number;
  byCurrency: VendorEarningsCurrencyBreakdown[];
}

export interface VendorSettlementPeriodBreakdown extends VendorEarningsBucketBreakdown {
  periodStart: Date;
  /** Exclusive — the next period's periodStart. */
  periodEnd: Date;
}

/**
 * Grouped-by-vendor counterpart of `VendorEarningsSnapshot`: same three
 * buckets (`pendingClaimWindow`, `accrued`, `settlementPreview`), commission
 * exposed alongside net at every bucket, keyed by `vendorId`.
 */
export interface VendorEarningsGroup {
  vendorId: string;
  pendingClaimWindow: VendorEarningsBucketBreakdown;
  accrued: VendorEarningsBucketBreakdown;
  settlementPreview: VendorSettlementPeriodBreakdown[];
}

@Injectable()
export class VendorEarningsService {
  private readonly logger = new Logger(VendorEarningsService.name);

  constructor(
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  /**
   * `scope.vendorId` undefined = platform-wide across all vendors (VE-4,
   * admin cross-vendor earnings); a concrete id scopes to one vendor's own
   * lines only (VE-5, vendor own-earnings) — ownership is enforced here in
   * the service layer, never left to the caller. `[from, to]` bounds the
   * candidate set by the order's `createdAt`, matching the existing
   * `VendorAnalyticsService` range convention. `now` defaults to the real
   * clock; overridable for deterministic period-bucketing tests.
   *
   * Only vendor lines (`order_items.vendorId` set) ever participate — a
   * platform line carries no commission and is never part of vendor payout
   * accounting in the first place (Listing Types & Vendor Rules' "no fake
   * house vendor" invariant), so they're excluded at the query level rather
   * than merely math'd to zero commission.
   */
  async getEarnings(
    scope: { vendorId?: string },
    from: Date,
    to: Date,
    now: Date = new Date(),
  ): Promise<VendorEarningsSnapshot> {
    const query = this.orderItemRepository
      .createQueryBuilder('oi')
      .leftJoinAndSelect('oi.order', 'o')
      .where('oi.vendorId IS NOT NULL')
      .andWhere('o.createdAt BETWEEN :from AND :to', { from, to })
      // Cancellation is only reachable from pending/confirmed per the order
      // state machine, so filtering on DELIVERED already excludes cancelled
      // orders — kept as a status filter (not a separate exclusion) since
      // that's the more precise rule anyway ("eligible" requires delivered).
      .andWhere('o.status = :delivered', { delivered: OrderStatus.DELIVERED });

    if (scope.vendorId) {
      query.andWhere('oi.vendorId = :vendorId', { vendorId: scope.vendorId });
    }

    const items = await query.getMany();
    const refundedOrderIds = await this.findRefundedOrderIds(items.map((item) => item.orderId));

    const pendingMap = new Map<CurrencyCode, number>();
    const accruedMap = new Map<CurrencyCode, number>();
    const periodBuckets = new Map<
      number,
      {
        periodStart: Date;
        periodEnd: Date;
        orderIds: Set<string>;
        netMap: Map<CurrencyCode, number>;
      }
    >();

    const nowPeriodIndex = periodIndexFor(now);

    for (const item of items) {
      const order = item.order;
      if (!order || !order.deliveredAt) continue; // defensive: should never happen once DELIVERED
      if (refundedOrderIds.has(item.orderId)) continue;

      // Every item reaching this loop has `vendorId` set (the query filters
      // `oi.vendorId IS NOT NULL`), so a null `commissionRatePercent` here is
      // a data-integrity gap (a backfill miss, or a row predating both
      // migrations) — never treat it as 0% commission, which would silently
      // forfeit the platform's cut. Exclude the line from every bucket
      // entirely and log so the gap is visible, not silently costing revenue.
      if (item.commissionRatePercent == null) {
        this.logger.warn(
          `Order item ${item.id} (order ${item.orderId}, vendor ${item.vendorId}) has a null ` +
            'commissionRatePercent — excluding it from vendor earnings entirely',
        );
        continue;
      }

      const grossCents = Math.round(Number(item.unitPrice) * 100) * item.quantity;
      const ratePercent = Number(item.commissionRatePercent);
      const { netCents } = splitGrossNetCents(grossCents, ratePercent);

      const claimWindowEndMs =
        order.deliveredAt.getTime() + DAMAGE_CLAIM_WINDOW_HOURS * 60 * 60 * 1000;

      if (now.getTime() < claimWindowEndMs) {
        pendingMap.set(item.currency, (pendingMap.get(item.currency) ?? 0) + netCents);
        continue;
      }

      // Eligible. Bucket by the bi-weekly period containing the eligibility
      // instant (deliveredAt + 48h claim window), NOT deliveredAt itself — a
      // line delivered in the last 48h of period N doesn't actually become
      // payout-eligible until period N+1, and a settlement batch running at
      // period N's close could never have paid it (the claim window hadn't
      // passed yet). Bucketing on deliveredAt would overstate period N.
      const linePeriodIndex = periodIndexFor(new Date(claimWindowEndMs));
      if (linePeriodIndex === nowPeriodIndex) {
        accruedMap.set(item.currency, (accruedMap.get(item.currency) ?? 0) + netCents);
        continue;
      }

      let bucket = periodBuckets.get(linePeriodIndex);
      if (!bucket) {
        const periodStart = new Date(
          SETTLEMENT_ANCHOR_DATE.getTime() + linePeriodIndex * PERIOD_LENGTH_MS,
        );
        bucket = {
          periodStart,
          periodEnd: new Date(periodStart.getTime() + PERIOD_LENGTH_MS),
          orderIds: new Set<string>(),
          netMap: new Map<CurrencyCode, number>(),
        };
        periodBuckets.set(linePeriodIndex, bucket);
      }
      bucket.orderIds.add(item.orderId);
      bucket.netMap.set(item.currency, (bucket.netMap.get(item.currency) ?? 0) + netCents);
    }

    const settlementPreview: SettlementPeriodSnapshot[] = Array.from(periodBuckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([, bucket]) => ({
        periodStart: bucket.periodStart,
        periodEnd: bucket.periodEnd,
        orderCount: bucket.orderIds.size,
        netByCurrency: toCurrencyTotals(bucket.netMap),
      }));

    return {
      pendingClaimWindow: toCurrencyTotals(pendingMap),
      accrued: toCurrencyTotals(accruedMap),
      settlementPreview,
    };
  }

  /**
   * Grouped-by-vendor counterpart of `getEarnings()` — VE-3's own
   * implementation notes anticipated this ("extend method to group-by-vendor
   * internally if VE-4 needs single-query efficiency"). Same eligibility
   * math, same three buckets, reusing `periodIndexFor`/`splitGrossNetCents`/
   * `DAMAGE_CLAIM_WINDOW_HOURS`/`SETTLEMENT_ANCHOR_DATE` — only what's
   * captured differs: results are keyed per vendor, and both commission and
   * net are kept at every bucket (not just net).
   *
   * `getEarnings()` itself is left untouched (still the single-scope,
   * net-only read used by VE-5's own-earnings case) rather than rewritten as
   * a thin wrapper over this method — that would mean converting Rand
   * amounts back to cents for re-aggregation, reintroducing exactly the kind
   * of float round-trip this file works hard to avoid. Two call sites over
   * the same well-tested per-line math is the safer trade.
   */
  async getEarningsByVendor(
    scope: { vendorId?: string },
    from: Date,
    to: Date,
    now: Date = new Date(),
  ): Promise<Map<string, VendorEarningsGroup>> {
    const query = this.orderItemRepository
      .createQueryBuilder('oi')
      .leftJoinAndSelect('oi.order', 'o')
      .where('oi.vendorId IS NOT NULL')
      .andWhere('o.createdAt BETWEEN :from AND :to', { from, to })
      .andWhere('o.status = :delivered', { delivered: OrderStatus.DELIVERED });

    if (scope.vendorId) {
      query.andWhere('oi.vendorId = :vendorId', { vendorId: scope.vendorId });
    }

    const items = await query.getMany();
    const refundedOrderIds = await this.findRefundedOrderIds(items.map((item) => item.orderId));

    const nowPeriodIndex = periodIndexFor(now);

    type MoneyCents = { commissionCents: number; netCents: number };
    interface VendorAccumulator {
      pendingOrderIds: Set<string>;
      pendingMap: Map<CurrencyCode, MoneyCents>;
      accruedOrderIds: Set<string>;
      accruedMap: Map<CurrencyCode, MoneyCents>;
      periodBuckets: Map<
        number,
        {
          periodStart: Date;
          periodEnd: Date;
          orderIds: Set<string>;
          map: Map<CurrencyCode, MoneyCents>;
        }
      >;
    }

    const byVendor = new Map<string, VendorAccumulator>();
    const accumulatorFor = (vendorId: string): VendorAccumulator => {
      let acc = byVendor.get(vendorId);
      if (!acc) {
        acc = {
          pendingOrderIds: new Set(),
          pendingMap: new Map(),
          accruedOrderIds: new Set(),
          accruedMap: new Map(),
          periodBuckets: new Map(),
        };
        byVendor.set(vendorId, acc);
      }
      return acc;
    };

    for (const item of items) {
      const order = item.order;
      if (!order || !order.deliveredAt) continue; // defensive: should never happen once DELIVERED
      if (refundedOrderIds.has(item.orderId)) continue;
      if (!item.vendorId) continue; // defensive: query filters oi.vendorId IS NOT NULL

      if (item.commissionRatePercent == null) {
        this.logger.warn(
          `Order item ${item.id} (order ${item.orderId}, vendor ${item.vendorId}) has a null ` +
            'commissionRatePercent — excluding it from vendor earnings entirely',
        );
        continue;
      }

      const acc = accumulatorFor(item.vendorId);

      const grossCents = Math.round(Number(item.unitPrice) * 100) * item.quantity;
      const ratePercent = Number(item.commissionRatePercent);
      const { commissionCents, netCents } = splitGrossNetCents(grossCents, ratePercent);

      const claimWindowEndMs =
        order.deliveredAt.getTime() + DAMAGE_CLAIM_WINDOW_HOURS * 60 * 60 * 1000;

      if (now.getTime() < claimWindowEndMs) {
        acc.pendingOrderIds.add(item.orderId);
        addMoneyCents(acc.pendingMap, item.currency, commissionCents, netCents);
        continue;
      }

      // Same eligibility-instant bucketing as getEarnings() — see that
      // method's comment for why this is deliveredAt + 48h, not deliveredAt.
      const linePeriodIndex = periodIndexFor(new Date(claimWindowEndMs));
      if (linePeriodIndex === nowPeriodIndex) {
        acc.accruedOrderIds.add(item.orderId);
        addMoneyCents(acc.accruedMap, item.currency, commissionCents, netCents);
        continue;
      }

      let bucket = acc.periodBuckets.get(linePeriodIndex);
      if (!bucket) {
        const periodStart = new Date(
          SETTLEMENT_ANCHOR_DATE.getTime() + linePeriodIndex * PERIOD_LENGTH_MS,
        );
        bucket = {
          periodStart,
          periodEnd: new Date(periodStart.getTime() + PERIOD_LENGTH_MS),
          orderIds: new Set<string>(),
          map: new Map<CurrencyCode, MoneyCents>(),
        };
        acc.periodBuckets.set(linePeriodIndex, bucket);
      }
      bucket.orderIds.add(item.orderId);
      addMoneyCents(bucket.map, item.currency, commissionCents, netCents);
    }

    const result = new Map<string, VendorEarningsGroup>();
    for (const [vendorId, acc] of byVendor.entries()) {
      const settlementPreview: VendorSettlementPeriodBreakdown[] = Array.from(
        acc.periodBuckets.entries(),
      )
        .sort(([a], [b]) => a - b)
        .map(([, bucket]) => ({
          periodStart: bucket.periodStart,
          periodEnd: bucket.periodEnd,
          orderCount: bucket.orderIds.size,
          byCurrency: toCurrencyBreakdowns(bucket.map),
        }));

      result.set(vendorId, {
        vendorId,
        pendingClaimWindow: {
          orderCount: acc.pendingOrderIds.size,
          byCurrency: toCurrencyBreakdowns(acc.pendingMap),
        },
        accrued: {
          orderCount: acc.accruedOrderIds.size,
          byCurrency: toCurrencyBreakdowns(acc.accruedMap),
        },
        settlementPreview,
      });
    }

    return result;
  }

  /**
   * Refund-exclusion hook (currently inert — no writer sets `refunded` yet,
   * see "Vendor Earnings & Commission" out-of-scope notes) wired now so
   * earnings are correct the moment a real refund flow lands, no follow-up
   * card needed.
   */
  private async findRefundedOrderIds(orderIds: string[]): Promise<Set<string>> {
    const uniqueIds = Array.from(new Set(orderIds));
    if (uniqueIds.length === 0) return new Set();

    const refunded = await this.paymentRepository.find({
      where: { orderId: In(uniqueIds), status: PaymentStatus.REFUNDED },
    });
    return new Set(refunded.map((payment) => payment.orderId));
  }
}

function periodIndexFor(date: Date): number {
  return Math.floor((date.getTime() - SETTLEMENT_ANCHOR_DATE.getTime()) / PERIOD_LENGTH_MS);
}

/**
 * Per-line rounding (vault-confirmed, non-negotiable): commission is rounded
 * half-up to 2dp; net is DERIVED by subtraction, never independently
 * rounded — this guarantees `commission + net === gross` on every line, done
 * in integer cents to avoid float drift (mirrors `OrdersService.create`'s
 * `Math.round(Number(product.price) * 100)` pattern).
 *
 * The whole computation stays in integers: `ratePercent` (e.g. 8.29) is
 * first converted to hundredths-of-a-percent (829), so `grossCents *
 * rateHundredths` is an integer product with no fractional multiplication
 * left exposed to IEEE 754 float error. `+5000` before the `/10000`
 * floor-division adds 0.5 (in hundredths-of-a-percent-cents units) ahead of
 * time, turning the floor into a round-half-up — plain `Math.round` on
 * `(grossCents * ratePercent) / 100` misrounds at exact-half-cent boundaries
 * (e.g. gross 5000 at 8.29% evaluates to 414.49999999999994 in float, one
 * cent short of the correct 415).
 *
 * `ratePercent` is never null here — a null `commissionRatePercent` on a
 * vendor line is a data-integrity gap and the caller excludes that line
 * before ever reaching this function (see the null-check in `getEarnings`).
 */
function splitGrossNetCents(
  grossCents: number,
  ratePercent: number,
): { commissionCents: number; netCents: number } {
  const rateHundredths = Math.round(ratePercent * 100); // e.g. 8.29 -> 829
  const commissionCents = Math.floor((grossCents * rateHundredths + 5000) / 10000);
  return { commissionCents, netCents: grossCents - commissionCents };
}

function toCurrencyTotals(map: Map<CurrencyCode, number>): CurrencyTotalDto[] {
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, cents]) => ({ currency, amount: cents / 100 }));
}

/** Accumulates one line's commission/net cents into a per-currency map, used by `getEarningsByVendor`. */
function addMoneyCents(
  map: Map<CurrencyCode, { commissionCents: number; netCents: number }>,
  currency: CurrencyCode,
  commissionCents: number,
  netCents: number,
): void {
  const existing = map.get(currency) ?? { commissionCents: 0, netCents: 0 };
  map.set(currency, {
    commissionCents: existing.commissionCents + commissionCents,
    netCents: existing.netCents + netCents,
  });
}

function toCurrencyBreakdowns(
  map: Map<CurrencyCode, { commissionCents: number; netCents: number }>,
): VendorEarningsCurrencyBreakdown[] {
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, cents]) => ({
      currency,
      commissionAmount: cents.commissionCents / 100,
      netAmount: cents.netCents / 100,
    }));
}
