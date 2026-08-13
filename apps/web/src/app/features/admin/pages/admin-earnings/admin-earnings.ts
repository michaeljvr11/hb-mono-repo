import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AdminEarningsReportDto, CurrencyCode, CurrencyTotalDto, VendorEarningsSummaryDto } from '@hb/shared';
import { AdminEarningsService } from '../../../../core/api/earnings.service';
import {
  EarningsRangeQuery,
  EarningsRangeSelector,
} from '../../../../shared/components/earnings-range-selector/earnings-range-selector';

@Component({
  selector: 'app-admin-earnings',
  standalone: true,
  imports: [DatePipe, EarningsRangeSelector],
  templateUrl: './admin-earnings.html',
  styleUrl: './admin-earnings.scss',
})
export class AdminEarnings implements OnInit {
  private readonly earningsService = inject(AdminEarningsService);

  readonly report = signal<AdminEarningsReportDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** The currently-active query fragment — a preset window or an explicit
   *  custom range, sourced from `EarningsRangeSelector`'s emissions. Defaults
   *  to '1m' (current calendar month) to match the API's own default AND
   *  `EarningsRangeSelector`'s own default active tab, so the initial fetch
   *  and the active tab agree without the selector needing to emit on init. */
  readonly currentQuery = signal<EarningsRangeQuery>({ window: '1m' });

  /** `heldForVendorsByCurrency` on this DTO is a "right now" snapshot, not
   *  scoped to the report window (see `AdminEarningsReportDto` doc comment) —
   *  it reads identically under any preset, including "All time". This flag
   *  only controls the RANGE sub-header label, never that field's caption. */
  readonly isAllTime = computed(() => {
    const query = this.currentQuery();
    return 'window' in query && query.window === 'all';
  });

  ngOnInit(): void {
    this.fetchReport();
  }

  onRangeSelected(query: EarningsRangeQuery): void {
    this.currentQuery.set(query);
    this.fetchReport();
  }

  private fetchReport(): void {
    this.loading.set(true);
    this.error.set(null);
    this.earningsService.getReport(this.currentQuery()).subscribe({
      next: (data) => {
        this.report.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load earnings report. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  /** Currencies with contributing gross activity for a vendor row. Commission/net always
   *  share the same currency set as gross per the earnings contract (gross = commission +
   *  net, currency-by-currency) — so gross is the single source of truth for "which
   *  currencies" this vendor row needs to render. */
  vendorCurrencies(vendor: VendorEarningsSummaryDto): CurrencyCode[] {
    return vendor.grossByCurrency.map((entry) => entry.currency);
  }

  private amountFor(entries: CurrencyTotalDto[], currency: CurrencyCode): number {
    return entries.find((entry) => entry.currency === currency)?.amount ?? 0;
  }

  vendorGross(vendor: VendorEarningsSummaryDto, currency: CurrencyCode): number {
    return this.amountFor(vendor.grossByCurrency, currency);
  }

  vendorCommission(vendor: VendorEarningsSummaryDto, currency: CurrencyCode): number {
    return this.amountFor(vendor.commissionByCurrency, currency);
  }

  vendorNet(vendor: VendorEarningsSummaryDto, currency: CurrencyCode): number {
    return this.amountFor(vendor.netByCurrency, currency);
  }

  /** Known currency symbols. Unknown currencies fall back to the ISO code only —
   *  the currency is always data, never assumed. */
  private static readonly CURRENCY_SYMBOLS: Partial<Record<CurrencyCode, string>> = {
    ZAR: 'R',
    NAD: 'N$',
  };

  /** Format an amount to 2 decimal places with its currency symbol. */
  formatMoney(amount: number, currency: CurrencyCode): string {
    const symbol = AdminEarnings.CURRENCY_SYMBOLS[currency] ?? '';
    return `${symbol} ${amount.toFixed(2)} ${currency}`.trim();
  }
}
