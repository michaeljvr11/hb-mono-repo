import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyCode, CurrencyTotalDto, SettlementPeriodPreviewDto, VendorEarningsReportDto } from '@hb/shared';
import { VendorEarningsService } from '../../../../core/api/vendor-earnings.service';
import {
  EarningsRangeQuery,
  EarningsRangeSelector,
} from '../../../../shared/components/earnings-range-selector/earnings-range-selector';

/** Client-side settlement-period page size. Server-side paging isn't an
 *  option here: `VendorEarningsReportDto.settlementPreview` is a fixed,
 *  unchanged array per the contract, so "All time" (and any wide custom
 *  range) can return years of bi-weekly periods that must not render as one
 *  unbounded list. */
const SETTLEMENT_PAGE_SIZE = 10;

@Component({
  selector: 'app-vendor-earnings',
  standalone: true,
  imports: [DatePipe, EarningsRangeSelector],
  templateUrl: './vendor-earnings.html',
  styleUrl: './vendor-earnings.scss',
})
export class VendorEarnings implements OnInit {
  private readonly earningsService = inject(VendorEarningsService);

  readonly report = signal<VendorEarningsReportDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** The currently-active query fragment — a preset window or an explicit
   *  custom range, sourced from `EarningsRangeSelector`'s emissions. Defaults
   *  to '1m' (current calendar month) to match the API's own default AND
   *  `EarningsRangeSelector`'s own default active tab, so the initial fetch
   *  and the active tab agree without the selector needing to emit on init. */
  readonly currentQuery = signal<EarningsRangeQuery>({ window: '1m' });

  readonly isAllTime = computed(() => {
    const query = this.currentQuery();
    return 'window' in query && query.window === 'all';
  });

  /** 1-based current page of the settlement-period table. */
  readonly settlementPage = signal(1);

  ngOnInit(): void {
    this.fetchReport();
  }

  onRangeSelected(query: EarningsRangeQuery): void {
    this.currentQuery.set(query);
    this.settlementPage.set(1);
    this.fetchReport();
  }

  private fetchReport(): void {
    this.loading.set(true);
    this.error.set(null);
    this.earningsService.getReport(this.currentQuery()).subscribe({
      next: (data) => {
        this.report.set(data);
        this.loading.set(false);
        this.settlementPage.set(this.defaultSettlementPage(data.settlementPreview));
      },
      error: () => {
        this.error.set('Failed to load your earnings report. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  private amountFor(entries: CurrencyTotalDto[], currency: CurrencyCode): number {
    return entries.find((entry) => entry.currency === currency)?.amount ?? 0;
  }

  /** Currencies with contributing gross activity. Fee/net always share gross's currency
   *  set (gross = fee + net, currency-by-currency per the earnings contract) — so gross
   *  is the single source of truth for "which currencies" the summary row needs. */
  summaryCurrencies(report: VendorEarningsReportDto): CurrencyCode[] {
    return report.summary.grossByCurrency.map((entry) => entry.currency);
  }

  summaryGross(report: VendorEarningsReportDto, currency: CurrencyCode): number {
    return this.amountFor(report.summary.grossByCurrency, currency);
  }

  summaryFee(report: VendorEarningsReportDto, currency: CurrencyCode): number {
    return this.amountFor(report.summary.commissionByCurrency, currency);
  }

  summaryNet(report: VendorEarningsReportDto, currency: CurrencyCode): number {
    return this.amountFor(report.summary.netByCurrency, currency);
  }

  /** Net currency total(s) for one settlement period, in period order. */
  periodCurrencies(period: SettlementPeriodPreviewDto): CurrencyCode[] {
    return period.netByCurrency.map((entry) => entry.currency);
  }

  /** `periodEnd` is EXCLUSIVE (the next period's start) — rendering it verbatim as a
   *  calendar date would visibly overlap with the following row's start date. Display
   *  the last inclusive day instead (periodEnd minus one day). */
  periodDisplayEnd(period: SettlementPeriodPreviewDto): Date {
    return new Date(new Date(period.periodEnd).getTime() - 24 * 60 * 60 * 1000);
  }

  periodNet(period: SettlementPeriodPreviewDto, currency: CurrencyCode): number {
    return this.amountFor(period.netByCurrency, currency);
  }

  /** Total pages for the settlement table at the current page size. Always
   *  at least 1 so page controls have something sane to render against even
   *  for an empty (impossible, but defensive) list. */
  settlementPageCount(periods: SettlementPeriodPreviewDto[]): number {
    return Math.max(1, Math.ceil(periods.length / SETTLEMENT_PAGE_SIZE));
  }

  /** The current page's slice of settlement periods, oldest-closed-first
   *  (unchanged order), page-size 10. */
  pagedSettlementPeriods(periods: SettlementPeriodPreviewDto[]): SettlementPeriodPreviewDto[] {
    const page = this.settlementPage();
    const start = (page - 1) * SETTLEMENT_PAGE_SIZE;
    return periods.slice(start, start + SETTLEMENT_PAGE_SIZE);
  }

  setSettlementPage(page: number): void {
    this.settlementPage.set(page);
  }

  /** The single always-present `'open'` period is appended LAST in
   *  `settlementPreview` (contract doc comment) — so on a long "All time"
   *  history it would land on the FINAL page, which a vendor checking their
   *  current accruing balance would never think to click to. Land on that
   *  last page by default whenever the list is non-trivial, so the open
   *  period is immediately visible rather than merely "reachable". A vendor
   *  who then pages backward through history keeps that state until their
   *  next range change resets it to the open period's page again. */
  private defaultSettlementPage(periods: SettlementPeriodPreviewDto[]): number {
    return this.settlementPageCount(periods);
  }

  /** Known currency symbols. Unknown currencies fall back to the ISO code only —
   *  the currency is always data, never assumed. */
  private static readonly CURRENCY_SYMBOLS: Partial<Record<CurrencyCode, string>> = {
    ZAR: 'R',
    NAD: 'N$',
  };

  /** Format an amount to 2 decimal places with its currency symbol. */
  formatMoney(amount: number, currency: CurrencyCode): string {
    const symbol = VendorEarnings.CURRENCY_SYMBOLS[currency] ?? '';
    return `${symbol} ${amount.toFixed(2)} ${currency}`.trim();
  }
}
