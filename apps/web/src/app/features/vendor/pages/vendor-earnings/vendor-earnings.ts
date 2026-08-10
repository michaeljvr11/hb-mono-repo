import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  CurrencyCode,
  CurrencyTotalDto,
  EarningsWindow,
  SettlementPeriodPreviewDto,
  VendorEarningsReportDto,
} from '@hb/shared';
import { VendorEarningsService } from '../../../../core/api/vendor-earnings.service';

interface WindowTab {
  label: string;
  value: EarningsWindow;
}

@Component({
  selector: 'app-vendor-earnings',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './vendor-earnings.html',
  styleUrl: './vendor-earnings.scss',
})
export class VendorEarnings implements OnInit {
  private readonly earningsService = inject(VendorEarningsService);

  readonly report = signal<VendorEarningsReportDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Server-side reporting window. Defaults to '1m' (current calendar month) — matches
   *  the API's own default, so the initial fetch and the active tab agree. */
  readonly selectedWindow = signal<EarningsWindow>('1m');

  /** Month + year for the "Last month" tab label, derived from the loaded report's
   *  server-resolved `from` with an explicit `timeZone: 'UTC'` — identical technique to
   *  `AdminEarnings.monthLabel`, avoiding the SSR/hydration text-mismatch that formatting
   *  a client-clock `new Date()` without a pinned zone can produce at month boundaries. */
  private readonly monthLabel = computed(() => {
    const from = this.report()?.from;
    const date = from ? new Date(from) : new Date();
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  });

  readonly windowTabs = computed<WindowTab[]>(() => [
    { label: 'Last week', value: '1w' },
    { label: 'Last 2 weeks', value: '2w' },
    { label: this.monthLabel(), value: '1m' },
  ]);

  ngOnInit(): void {
    this.fetchReport();
  }

  private fetchReport(): void {
    this.loading.set(true);
    this.error.set(null);
    this.earningsService.getReport({ window: this.selectedWindow() }).subscribe({
      next: (data) => {
        this.report.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load your earnings report. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  setWindow(value: EarningsWindow): void {
    if (this.selectedWindow() === value) return;
    this.selectedWindow.set(value);
    this.fetchReport();
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

  periodNet(period: SettlementPeriodPreviewDto, currency: CurrencyCode): number {
    return this.amountFor(period.netByCurrency, currency);
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
