import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AdminEarningsReportDto,
  CurrencyCode,
  CurrencyTotalDto,
  EarningsWindow,
  VendorEarningsSummaryDto,
} from '@hb/shared';
import { AdminEarningsService } from '../../../../core/api/earnings.service';

interface WindowTab {
  label: string;
  value: EarningsWindow;
}

@Component({
  selector: 'app-admin-earnings',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './admin-earnings.html',
  styleUrl: './admin-earnings.scss',
})
export class AdminEarnings implements OnInit {
  private readonly earningsService = inject(AdminEarningsService);

  readonly report = signal<AdminEarningsReportDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Server-side reporting window. Defaults to '1m' (current calendar month) — matches
   *  the API's own default, so the initial fetch and the active tab agree. */
  readonly selectedWindow = signal<EarningsWindow>('1m');

  /** Current month + year, for the "Last month" tab label — the AC requires the actual
   *  month name (e.g. "August 2026") so admins don't misread it as a rolling 30-day window.
   *  Computed once from the client clock at page load; the server resolves the real
   *  `from`/`to`, this is display-only.
   *  ponytail: a page load in the last instants of a month could show a label one tick
   *  stale vs. the server-resolved window; upgrade trigger: derive from the loaded
   *  report's `from` instead, if that ever causes a real mismatch complaint. */
  private readonly currentMonthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  readonly windowTabs: WindowTab[] = [
    { label: 'Last week', value: '1w' },
    { label: 'Last 2 weeks', value: '2w' },
    { label: this.currentMonthLabel, value: '1m' },
  ];

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
        this.error.set('Failed to load earnings report. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  setWindow(value: EarningsWindow): void {
    if (this.selectedWindow() === value) return;
    this.selectedWindow.set(value);
    this.fetchReport();
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
