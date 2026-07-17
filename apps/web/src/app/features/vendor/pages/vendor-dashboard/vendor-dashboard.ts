import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe, KeyValuePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AnalyticsEventType, CurrencyCode, VendorAnalyticsDto, VendorDashboardDto } from '@hb/shared';
import { VendorsService } from '../../../../core/api/vendors.service';

/** Human-readable labels for the funnel widget, in enum declaration order. */
/** Sentence case to match the admin dashboard's funnel labels. */
const STAGE_LABELS: Record<AnalyticsEventType, string> = {
  [AnalyticsEventType.PRODUCT_VIEWED]: 'Product viewed',
  [AnalyticsEventType.ADD_TO_CART]: 'Add to cart',
  [AnalyticsEventType.CHECKOUT_STARTED]: 'Checkout started',
  [AnalyticsEventType.SHIPPING_SUBMITTED]: 'Shipping submitted',
  [AnalyticsEventType.PAYMENT_ATTEMPTED]: 'Payment attempted',
  [AnalyticsEventType.PAYMENT_FAILED]: 'Payment failed',
  [AnalyticsEventType.ORDER_COMPLETED]: 'Order completed',
};

@Component({
  selector: 'app-vendor-dashboard',
  standalone: true,
  imports: [DecimalPipe, KeyValuePipe, RouterLink],
  templateUrl: './vendor-dashboard.html',
  styleUrl: './vendor-dashboard.scss',
})
export class VendorDashboard implements OnInit {
  private readonly vendorsService = inject(VendorsService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly dashboard = signal<VendorDashboardDto | null>(null);

  readonly analyticsLoading = signal(true);
  readonly analyticsError = signal<string | null>(null);
  readonly analytics = signal<VendorAnalyticsDto | null>(null);

  readonly totalOrders = computed(() => {
    const counts = this.dashboard()?.orderCountByStatus ?? {};
    return Object.values(counts).reduce((sum, n) => sum + n, 0);
  });

  /** Widest funnel bar's session count — 0 when the whole funnel is zero. */
  readonly maxFunnelSessions = computed(() => {
    const stages = this.analytics()?.funnel ?? [];
    return stages.reduce((max, stage) => Math.max(max, stage.sessions), 0);
  });

  readonly CurrencyCode = CurrencyCode;

  ngOnInit(): void {
    this.vendorsService.getDashboard().subscribe({
      next: (data) => {
        this.dashboard.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load dashboard data. Please refresh.');
        this.loading.set(false);
      },
    });

    this.vendorsService.getAnalytics().subscribe({
      next: (data) => {
        this.analytics.set(data);
        this.analyticsLoading.set(false);
      },
      error: () => {
        this.analyticsError.set('Could not load analytics data. Please refresh.');
        this.analyticsLoading.set(false);
      },
    });
  }

  /** Human-readable label for a funnel stage. */
  stageLabel(stage: AnalyticsEventType): string {
    return STAGE_LABELS[stage] ?? stage;
  }

  /** Bar width (%) for a funnel stage, relative to the funnel's busiest stage. */
  funnelWidth(sessions: number): number {
    const max = this.maxFunnelSessions();
    return max === 0 ? 0 : (sessions / max) * 100;
  }

  /** ZAR/NAD are never summed — this only picks the display symbol for one row. */
  currencySymbol(code: CurrencyCode): string {
    return code === CurrencyCode.ZAR ? 'R' : 'N$';
  }
}
