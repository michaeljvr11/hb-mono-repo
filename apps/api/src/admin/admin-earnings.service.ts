import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AdminEarningsQuery,
  AdminEarningsReportDto,
  CurrencyCode,
  CurrencyTotalDto,
  ListingType,
  OrderStatus,
  VendorEarningsSummaryDto,
  VendorStatus,
} from '@hb/shared';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import {
  VendorEarningsBucketBreakdown,
  VendorEarningsGroup,
  VendorEarningsService,
} from '../earnings/vendor-earnings.service';
import { resolveEarningsWindow } from '../common/utils/earnings-window.utils';
import { AdminEarningsResponseDto } from './dto/admin-earnings-response.dto';

/**
 * Admin cross-vendor earnings report (VE-4) — builds `AdminEarningsReportDto`
 * on top of VE-3's `VendorEarningsService`. See vault "Vendor Earnings &
 * Commission" for the full accounting rules; this service's own comments
 * cover only the assembly/aggregation decisions specific to VE-4:
 *
 * - **Per-vendor rows are eligible-lines-only**: built from each vendor's
 *   `accrued` + `settlementPreview` buckets, excluding `pendingClaimWindow`
 *   entirely (lines still inside their 48h claim window contribute nothing
 *   to a vendor's row). `grossByCurrency` is always DERIVED as
 *   `commissionByCurrency + netByCurrency` per currency — never summed from
 *   an independent gross figure — so the identity holds exactly by
 *   construction, not by coincidence.
 * - **Every currently-APPROVED vendor appears**, even with zero eligible
 *   activity (zero-fill: `orderCount: 0`, empty currency arrays) — omit-zero
 *   *currency* entries within a vendor's arrays, never omit-zero *vendors*.
 * - **`vendorId` narrows everything**, not just the `vendors[]` array — the
 *   headline platform-wide figures (`platformCommissionByCurrency`,
 *   `heldForVendorsByCurrency`, `platformListingGmvByCurrency`) scope to
 *   that one vendor too. Chosen as the principle of least surprise for a
 *   filtered admin report; the AC leaves this open, this is the documented
 *   decision.
 * - **`heldForVendorsByCurrency`** = VE-3's `accrued` bucket (net), summed
 *   across whatever vendor scope applies — literally unmodified in meaning.
 * - **`platformCommissionByCurrency`** = commission portion of
 *   (`accrued` + `settlementPreview`) summed across whatever vendor scope
 *   applies — the SAME eligible-only universe as the per-vendor table. It is
 *   summed from `VendorEarningsService.getEarningsByVendor`'s full result
 *   (every vendor with activity in range under the scope), NOT narrowed to
 *   only the currently-APPROVED vendors shown in `vendors[]` — a vendor's
 *   historical commission remains real platform revenue even if their
 *   status later changes (suspended/rejected after the fact). In the common
 *   case (all active vendors stay approved) this exactly equals the sum of
 *   the per-vendor `commissionByCurrency` figures shown in the report — an
 *   intentional internal-consistency property asserted in tests.
 * - **`platformListingGmvByCurrency`** mirrors `AdminOrdersService.getDashboard`'s
 *   `platformRevenue` definition (gross line GMV of `listingType = PLATFORM`
 *   lines, cancelled orders excluded), just windowed by `order.createdAt`.
 *   Explicitly GMV, not revenue — no delivered/refund gating here. Platform
 *   lines never carry a `vendorId` ("no fake house vendor" invariant, see
 *   [[Listing Types & Vendor Rules]]), so applying the `vendorId` scope here
 *   is a deliberate no-op filter that correctly yields an empty result, not
 *   a special case needing its own branch.
 */
@Injectable()
export class AdminEarningsService {
  constructor(
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    private readonly vendorEarningsService: VendorEarningsService,
  ) {}

  async getReport(query: AdminEarningsQuery): Promise<AdminEarningsReportDto> {
    const { from, to } = resolveEarningsWindow(query);
    const vendorId = query.vendorId;

    const vendorWhere: { status: VendorStatus; id?: string } = { status: VendorStatus.APPROVED };
    if (vendorId) {
      vendorWhere.id = vendorId;
    }
    const approvedVendors = await this.vendorRepo.find({
      where: vendorWhere,
      order: { businessName: 'ASC' },
    });

    const byVendor = await this.vendorEarningsService.getEarningsByVendor({ vendorId }, from, to);

    const vendors: VendorEarningsSummaryDto[] = approvedVendors.map((vendor) => {
      const { orderCount, commissionByCurrency, netByCurrency } = this.eligibleTotals(
        byVendor.get(vendor.id),
      );
      return {
        vendorId: vendor.id,
        businessName: vendor.businessName,
        orderCount,
        grossByCurrency: this.deriveGross(commissionByCurrency, netByCurrency),
        commissionByCurrency,
        netByCurrency,
      };
    });

    const heldForVendorsByCurrency = this.sumHeldForVendors(byVendor);
    const platformCommissionByCurrency = this.sumPlatformCommission(byVendor);
    const platformListingGmvByCurrency = await this.getPlatformListingGmv(from, to, vendorId);

    const result = new AdminEarningsResponseDto();
    result.from = from.toISOString();
    result.to = to.toISOString();
    result.vendors = vendors;
    result.platformCommissionByCurrency = platformCommissionByCurrency;
    result.platformListingGmvByCurrency = platformListingGmvByCurrency;
    result.heldForVendorsByCurrency = heldForVendorsByCurrency;
    return result;
  }

  /**
   * Merges a vendor's `accrued` + `settlementPreview` buckets (eligible
   * lines only — `pendingClaimWindow` is intentionally excluded) into flat
   * per-currency commission/net totals plus a distinct order count. An
   * order's items (for a given vendor) always land in exactly one bucket —
   * eligibility depends only on `order.deliveredAt`, shared by every line on
   * that order — so summing `orderCount` across buckets never double-counts.
   */
  private eligibleTotals(group: VendorEarningsGroup | undefined): {
    orderCount: number;
    commissionByCurrency: CurrencyTotalDto[];
    netByCurrency: CurrencyTotalDto[];
  } {
    if (!group) {
      return { orderCount: 0, commissionByCurrency: [], netByCurrency: [] };
    }

    const commissionMap = new Map<CurrencyCode, number>();
    const netMap = new Map<CurrencyCode, number>();
    let orderCount = group.accrued.orderCount;

    this.accumulateBucket(group.accrued, commissionMap, netMap);
    for (const period of group.settlementPreview) {
      orderCount += period.orderCount;
      this.accumulateBucket(period, commissionMap, netMap);
    }

    return {
      orderCount,
      commissionByCurrency: this.toSortedTotals(commissionMap),
      netByCurrency: this.toSortedTotals(netMap),
    };
  }

  private accumulateBucket(
    bucket: VendorEarningsBucketBreakdown,
    commissionMap: Map<CurrencyCode, number>,
    netMap: Map<CurrencyCode, number>,
  ): void {
    for (const c of bucket.byCurrency) {
      commissionMap.set(c.currency, (commissionMap.get(c.currency) ?? 0) + c.commissionAmount);
      netMap.set(c.currency, (netMap.get(c.currency) ?? 0) + c.netAmount);
    }
  }

  /**
   * `grossByCurrency` is ALWAYS derived from commission + net — never
   * independently computed. `commission` is already sorted (it comes from
   * `toSortedTotals`), so no re-sort needed here.
   */
  private deriveGross(commission: CurrencyTotalDto[], net: CurrencyTotalDto[]): CurrencyTotalDto[] {
    const netMap = new Map(net.map((c) => [c.currency, c.amount]));
    return commission.map((c) => ({
      currency: c.currency,
      amount: Math.round((c.amount + (netMap.get(c.currency) ?? 0)) * 100) / 100,
    }));
  }

  private sumHeldForVendors(byVendor: Map<string, VendorEarningsGroup>): CurrencyTotalDto[] {
    const map = new Map<CurrencyCode, number>();
    for (const group of byVendor.values()) {
      for (const c of group.accrued.byCurrency) {
        map.set(c.currency, (map.get(c.currency) ?? 0) + c.netAmount);
      }
    }
    return this.toSortedTotals(map);
  }

  private sumPlatformCommission(byVendor: Map<string, VendorEarningsGroup>): CurrencyTotalDto[] {
    const map = new Map<CurrencyCode, number>();
    for (const group of byVendor.values()) {
      for (const c of group.accrued.byCurrency) {
        map.set(c.currency, (map.get(c.currency) ?? 0) + c.commissionAmount);
      }
      for (const period of group.settlementPreview) {
        for (const c of period.byCurrency) {
          map.set(c.currency, (map.get(c.currency) ?? 0) + c.commissionAmount);
        }
      }
    }
    return this.toSortedTotals(map);
  }

  private async getPlatformListingGmv(
    from: Date,
    to: Date,
    vendorId?: string,
  ): Promise<CurrencyTotalDto[]> {
    const qb = this.orderItemRepo
      .createQueryBuilder('oi')
      .leftJoin('oi.order', 'o')
      .where('oi.listingType = :platform', { platform: ListingType.PLATFORM })
      .andWhere('o.createdAt BETWEEN :from AND :to', { from, to })
      .andWhere('o.status != :cancelled', { cancelled: OrderStatus.CANCELLED });

    if (vendorId) {
      qb.andWhere('oi.vendorId = :vendorId', { vendorId });
    }

    const items = await qb.getMany();
    // Integer cents throughout, same anti-float-drift discipline as
    // `VendorEarningsService.splitGrossNetCents` — convert to decimal only
    // in the final map entry, not mid-accumulation.
    const centsMap = new Map<CurrencyCode, number>();
    for (const item of items) {
      const lineTotalCents = Math.round(Number(item.unitPrice) * 100) * item.quantity;
      centsMap.set(item.currency, (centsMap.get(item.currency) ?? 0) + lineTotalCents);
    }
    const map = new Map<CurrencyCode, number>();
    for (const [currency, cents] of centsMap) {
      map.set(currency, cents / 100);
    }
    return this.toSortedTotals(map);
  }

  private toSortedTotals(map: Map<CurrencyCode, number>): CurrencyTotalDto[] {
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
  }
}
