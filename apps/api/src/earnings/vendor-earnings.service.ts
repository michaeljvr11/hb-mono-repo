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
