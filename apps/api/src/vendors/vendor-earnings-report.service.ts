import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CurrencyCode,
  CurrencyTotalDto,
  EarningsBalanceDto,
  SettlementPeriodPreviewDto,
  VendorEarningsQuery,
  VendorEarningsReportDto,
  VendorEarningsSummaryDto,
} from '@hb/shared';
import { Vendor } from './entities/vendor.entity';
import {
  currentSettlementPeriodBounds,
  VendorEarningsBucketBreakdown,
  VendorEarningsCurrencyBreakdown,
  VendorEarningsGroup,
  VendorEarningsService,
} from '../earnings/vendor-earnings.service';
import { resolveEarningsWindow } from '../common/utils/earnings-window.utils';
import { VendorEarningsResponseDto } from './dto/vendor-earnings-response.dto';

/**
 * Vendor's own earnings report (VE-5, GET /vendors/me/earnings) — the
 * vendor-scoped mirror of `AdminEarningsService.getReport()`. See vault
 * "Vendor Earnings & Commission" for the accounting rules; this service's
 * own comments cover only the assembly decisions specific to the
 * own-earnings case:
 *
 * - **Ownership boundary**: the vendor is resolved ONLY from the
 *   authenticated `userId` (never a client-supplied id/param), matching
 *   `VendorsService.getDashboard`'s pattern. `NotFoundException` if the user
 *   has no vendor profile.
 * - **`summary` is eligible-lines-only**, deliberately re-implemented as a
 *   small local equivalent of `AdminEarningsService.eligibleTotals`/
 *   `deriveGross` (those are private to the already-merged admin service) —
 *   merges `accrued` + all `settlementPreview` periods, excluding
 *   `pendingClaimWindow` entirely. `grossByCurrency` is always DERIVED as
 *   commission + net, never independently computed.
 * - **`balance` is net-only** — commission is H&B's cut, not surfaced to the
 *   vendor here; `pendingClaimWindowByCurrency`/`accruedByCurrency` map
 *   directly off VE-3's two matching buckets.
 * - **`settlementPreview`** maps VE-3's closed periods 1:1 (`status:
 *   'closed'`) and appends exactly one synthetic `'open'` entry sourced from
 *   `accrued` + `currentSettlementPeriodBounds` — always present, even when
 *   all-zero, so a vendor with no activity still sees "this period: R0.00".
 * - A single `now` instant is threaded through `resolveEarningsWindow`,
 *   `VendorEarningsService.getEarningsByVendor`, and
 *   `currentSettlementPeriodBounds` so the whole report is internally
 *   consistent relative to one clock reading (also makes the assembly
 *   logic deterministically testable).
 */
@Injectable()
export class VendorEarningsReportService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepository: Repository<Vendor>,
    private readonly vendorEarningsService: VendorEarningsService,
  ) {}

  async getMyEarnings(
    userId: string,
    query: VendorEarningsQuery,
    now: Date = new Date(),
  ): Promise<VendorEarningsReportDto> {
    const vendor = await this.vendorRepository.findOne({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const { from, to } = resolveEarningsWindow(query, now);

    const byVendor = await this.vendorEarningsService.getEarningsByVendor(
      { vendorId: vendor.id },
      from,
      to,
      now,
    );
    const group = byVendor.get(vendor.id);

    const result = new VendorEarningsResponseDto();
    result.from = from.toISOString();
    result.to = to.toISOString();
    result.summary = this.buildSummary(vendor.id, vendor.businessName, group);
    result.balance = this.buildBalance(group);
    result.settlementPreview = this.buildSettlementPreview(group, now);
    return result;
  }

  private buildBalance(group: VendorEarningsGroup | undefined): EarningsBalanceDto {
    return {
      pendingClaimWindowByCurrency: this.netOnly(group?.pendingClaimWindow),
      accruedByCurrency: this.netOnly(group?.accrued),
    };
  }

  /**
   * Mirrors `AdminEarningsService.eligibleTotals`/`deriveGross` (private
   * there, so re-implemented locally rather than importing internals):
   * merges `accrued` + all `settlementPreview` periods into flat
   * commission/net totals and a summed order count, excluding
   * `pendingClaimWindow` — same eligible-lines-only rule VE-4 established.
   */
  private buildSummary(
    vendorId: string,
    businessName: string,
    group: VendorEarningsGroup | undefined,
  ): VendorEarningsSummaryDto {
    if (!group) {
      return {
        vendorId,
        businessName,
        orderCount: 0,
        grossByCurrency: [],
        commissionByCurrency: [],
        netByCurrency: [],
      };
    }

    const commissionMap = new Map<CurrencyCode, number>();
    const netMap = new Map<CurrencyCode, number>();
    let orderCount = group.accrued.orderCount;

    this.accumulate(group.accrued, commissionMap, netMap);
    for (const period of group.settlementPreview) {
      orderCount += period.orderCount;
      this.accumulate(period, commissionMap, netMap);
    }

    const commissionByCurrency = this.toSortedTotals(commissionMap);
    const netByCurrency = this.toSortedTotals(netMap);
    return {
      vendorId,
      businessName,
      orderCount,
      grossByCurrency: this.deriveGross(commissionByCurrency, netByCurrency),
      commissionByCurrency,
      netByCurrency,
    };
  }

  private accumulate(
    bucket: VendorEarningsBucketBreakdown,
    commissionMap: Map<CurrencyCode, number>,
    netMap: Map<CurrencyCode, number>,
  ): void {
    for (const c of bucket.byCurrency) {
      commissionMap.set(c.currency, (commissionMap.get(c.currency) ?? 0) + c.commissionAmount);
      netMap.set(c.currency, (netMap.get(c.currency) ?? 0) + c.netAmount);
    }
  }

  /** `grossByCurrency` is ALWAYS derived from commission + net — never independently computed. */
  private deriveGross(commission: CurrencyTotalDto[], net: CurrencyTotalDto[]): CurrencyTotalDto[] {
    const netMap = new Map(net.map((c) => [c.currency, c.amount]));
    return commission.map((c) => ({
      currency: c.currency,
      amount: Math.round((c.amount + (netMap.get(c.currency) ?? 0)) * 100) / 100,
    }));
  }

  private buildSettlementPreview(
    group: VendorEarningsGroup | undefined,
    now: Date,
  ): SettlementPeriodPreviewDto[] {
    const closed: SettlementPeriodPreviewDto[] = (group?.settlementPreview ?? []).map((period) => ({
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      orderCount: period.orderCount,
      netByCurrency: this.netOnly(period),
      status: 'closed',
    }));

    const { periodStart, periodEnd } = currentSettlementPeriodBounds(now);
    const open: SettlementPeriodPreviewDto = {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      orderCount: group?.accrued?.orderCount ?? 0,
      netByCurrency: this.netOnly(group?.accrued),
      status: 'open',
    };

    return [...closed, open];
  }

  private netOnly(
    bucket: { byCurrency: VendorEarningsCurrencyBreakdown[] } | undefined,
  ): CurrencyTotalDto[] {
    if (!bucket) return [];
    return bucket.byCurrency.map((c) => ({ currency: c.currency, amount: c.netAmount }));
  }

  private toSortedTotals(map: Map<CurrencyCode, number>): CurrencyTotalDto[] {
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
  }
}
