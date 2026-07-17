import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AdminAnalyticsSummaryDto,
  AdminDashboardDto,
  AnalyticsEventType,
  CurrencyCode,
  FunnelStageCountDto,
} from '@hb/shared';
import { AdminOrdersService } from '../../../../core/api/admin-orders.service';
import { AdminAnalyticsService } from '../../../../core/api/admin-analytics.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements OnInit {
  private readonly adminOrdersService = inject(AdminOrdersService);
  private readonly adminAnalyticsService = inject(AdminAnalyticsService);

  readonly dashboard = signal<AdminDashboardDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly analytics = signal<AdminAnalyticsSummaryDto | null>(null);
  readonly analyticsLoading = signal(true);
  readonly analyticsError = signal<string | null>(null);

  ngOnInit(): void {
    this.adminOrdersService.getDashboard().subscribe({
      next: (data) => {
        this.dashboard.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load dashboard. Please refresh the page.');
        this.loading.set(false);
      },
    });

    // Default range (no params) — server defaults to the last 30 days.
    this.adminAnalyticsService.getSummary().subscribe({
      next: (data) => {
        this.analytics.set(data);
        this.analyticsLoading.set(false);
      },
      error: () => {
        this.analyticsError.set('Failed to load analytics. Please refresh the page.');
        this.analyticsLoading.set(false);
      },
    });
  }

  /** Humanise an OrderStatus string (e.g. "pending" → "Pending"). */
  humanizeStatus(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  /** Humanise an AnalyticsEventType stage (e.g. "product_viewed" → "Product viewed"). */
  stageLabel(stage: AnalyticsEventType): string {
    const words = stage.split('_').join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /** Widest stage's session count — the funnel bar-width denominator. Floored
   *  at 1 so an all-zero (empty) funnel still renders 0%-width bars instead
   *  of dividing by zero. */
  funnelMax(funnel: FunnelStageCountDto[]): number {
    return Math.max(1, ...funnel.map((f) => f.sessions));
  }

  /** Bar width as a whole-number percentage relative to the widest stage. */
  funnelBarWidth(sessions: number, max: number): number {
    return max === 0 ? 0 : Math.round((sessions / max) * 100);
  }

  /** conversionRate is a 0–1 fraction; render as a percentage, 1 decimal. */
  formatPercent(rate: number): string {
    return `${(rate * 100).toFixed(1)}%`;
  }

  /** Known currency symbols. Unknown currencies fall back to the ISO code only —
   *  the currency is always data, never assumed. */
  private static readonly CURRENCY_SYMBOLS: Partial<Record<CurrencyCode, string>> = {
    ZAR: 'R',
    NAD: 'N$',
  };

  /** Format an amount to 2 decimal places with its currency symbol. */
  formatMoney(amount: number, currency: CurrencyCode): string {
    const symbol = AdminDashboard.CURRENCY_SYMBOLS[currency] ?? '';
    return `${symbol} ${amount.toFixed(2)} ${currency}`.trim();
  }
}
