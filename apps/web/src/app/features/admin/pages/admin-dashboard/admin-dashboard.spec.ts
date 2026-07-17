import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AdminAnalyticsSummaryDto,
  AdminDashboardDto,
  AnalyticsEventType,
  CurrencyCode,
  OrderStatus,
} from '@hb/shared';

import { AdminDashboard } from './admin-dashboard';
import { AdminOrdersService } from '../../../../core/api/admin-orders.service';
import { AdminAnalyticsService } from '../../../../core/api/admin-analytics.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_DASHBOARD: AdminDashboardDto = {
  pendingVendorCount: 3,
  totalOrders: 42,
  orderCountsByStatus: [
    { status: OrderStatus.PENDING,    count: 10 },
    { status: OrderStatus.CONFIRMED,  count: 8 },
    { status: OrderStatus.PROCESSING, count: 5 },
    { status: OrderStatus.SHIPPED,    count: 12 },
    { status: OrderStatus.DELIVERED,  count: 6 },
    { status: OrderStatus.CANCELLED,  count: 1 },
  ],
  platformRevenue: [
    { currency: CurrencyCode.ZAR, amount: 15000.50 },
    { currency: CurrencyCode.NAD, amount: 3200.00 },
  ],
  vendorRevenue: [
    { currency: CurrencyCode.ZAR, amount: 8000.00 },
  ],
};

const ZERO_DASHBOARD: AdminDashboardDto = {
  pendingVendorCount: 0,
  totalOrders: 0,
  orderCountsByStatus: [
    { status: OrderStatus.PENDING,    count: 0 },
    { status: OrderStatus.CONFIRMED,  count: 0 },
    { status: OrderStatus.PROCESSING, count: 0 },
    { status: OrderStatus.SHIPPED,    count: 0 },
    { status: OrderStatus.DELIVERED,  count: 0 },
    { status: OrderStatus.CANCELLED,  count: 0 },
  ],
  platformRevenue: [],
  vendorRevenue: [],
};

const MOCK_ANALYTICS: AdminAnalyticsSummaryDto = {
  funnel: [
    { stage: AnalyticsEventType.PRODUCT_VIEWED,     sessions: 100 },
    { stage: AnalyticsEventType.ADD_TO_CART,        sessions: 40 },
    { stage: AnalyticsEventType.CHECKOUT_STARTED,   sessions: 20 },
    { stage: AnalyticsEventType.SHIPPING_SUBMITTED, sessions: 15 },
    { stage: AnalyticsEventType.PAYMENT_ATTEMPTED,  sessions: 12 },
    { stage: AnalyticsEventType.PAYMENT_FAILED,     sessions: 2 },
    { stage: AnalyticsEventType.ORDER_COMPLETED,    sessions: 10 },
  ],
  conversionRate: 0.1,
  revenueByCurrency: [
    { currency: CurrencyCode.ZAR, amount: 5000.25 },
    { currency: CurrencyCode.NAD, amount: 1200.00 },
  ],
  timeSeries: [
    {
      date: '2026-07-01',
      orders: 5,
      revenueByCurrency: [{ currency: CurrencyCode.ZAR, amount: 2500.00 }],
    },
    {
      date: '2026-07-02',
      orders: 3,
      revenueByCurrency: [{ currency: CurrencyCode.NAD, amount: 900.00 }],
    },
  ],
};

const ZERO_ANALYTICS: AdminAnalyticsSummaryDto = {
  funnel: [
    { stage: AnalyticsEventType.PRODUCT_VIEWED,     sessions: 0 },
    { stage: AnalyticsEventType.ADD_TO_CART,        sessions: 0 },
    { stage: AnalyticsEventType.CHECKOUT_STARTED,   sessions: 0 },
    { stage: AnalyticsEventType.SHIPPING_SUBMITTED, sessions: 0 },
    { stage: AnalyticsEventType.PAYMENT_ATTEMPTED,  sessions: 0 },
    { stage: AnalyticsEventType.PAYMENT_FAILED,     sessions: 0 },
    { stage: AnalyticsEventType.ORDER_COMPLETED,    sessions: 0 },
  ],
  conversionRate: 0,
  revenueByCurrency: [],
  timeSeries: [],
};

// ─── Service stubs ───────────────────────────────────────────────────────────

interface AdminOrdersServiceStub {
  getDashboard: ReturnType<typeof vi.fn>;
  listOrders: ReturnType<typeof vi.fn>;
}

interface AdminAnalyticsServiceStub {
  getSummary: ReturnType<typeof vi.fn>;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function createComponent(
  ordersStub: AdminOrdersServiceStub,
  analyticsStub: AdminAnalyticsServiceStub,
): Promise<{
  component: AdminDashboard;
  fixture: ComponentFixture<AdminDashboard>;
  nativeEl: HTMLElement;
}> {
  await TestBed.configureTestingModule({
    imports: [AdminDashboard],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AdminOrdersService, useValue: ordersStub },
      { provide: AdminAnalyticsService, useValue: analyticsStub },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AdminDashboard);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();

  return { component, fixture, nativeEl: fixture.nativeElement as HTMLElement };
}

function defaultAnalyticsStub(): AdminAnalyticsServiceStub {
  return { getSummary: vi.fn(() => of({ ...MOCK_ANALYTICS })) };
}

function defaultOrdersStub(): AdminOrdersServiceStub {
  return {
    getDashboard: vi.fn(() => of({ ...MOCK_DASHBOARD })),
    listOrders: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AdminDashboard component', () => {
  let component: AdminDashboard;
  let fixture: ComponentFixture<AdminDashboard>;
  let nativeEl: HTMLElement;
  let ordersStub: AdminOrdersServiceStub;
  let analyticsStub: AdminAnalyticsServiceStub;

  beforeEach(async () => {
    ordersStub = defaultOrdersStub();
    analyticsStub = defaultAnalyticsStub();

    ({ component, fixture, nativeEl } = await createComponent(ordersStub, analyticsStub));
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('calls getDashboard on init and clears loading', () => {
    expect(ordersStub.getDashboard).toHaveBeenCalledTimes(1);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('sets dashboard signal with returned data', () => {
    const data = component.dashboard();
    expect(data).not.toBeNull();
    expect(data!.pendingVendorCount).toBe(3);
    expect(data!.totalOrders).toBe(42);
  });

  it('renders pending-vendor CTA with correct count', () => {
    const cta = nativeEl.querySelector('.metric-card--cta');
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toContain('3');
    expect(cta!.textContent).toContain('awaiting approval');
  });

  it('pending-vendor CTA links to /admin/vendors', () => {
    const cta = nativeEl.querySelector('.metric-card--cta') as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    // routerLink renders as href in test env
    expect(cta.getAttribute('ng-reflect-router-link') ?? cta.getAttribute('href') ?? cta.getAttribute('routerLink')).toContain('/admin/vendors');
  });

  it('renders totalOrders value', () => {
    const cards = nativeEl.querySelectorAll('.metric-card');
    const texts = Array.from(cards).map(c => c.textContent ?? '');
    expect(texts.some(t => t.includes('42'))).toBe(true);
  });

  it('renders order counts by status', () => {
    const statusItems = nativeEl.querySelectorAll('.status-item');
    expect(statusItems.length).toBeGreaterThan(0);
    const fullText = nativeEl.querySelector('.status-list')?.textContent ?? '';
    expect(fullText).toContain('10'); // pending count
    expect(fullText).toContain('12'); // shipped count
  });

  it('renders platform revenue per currency', () => {
    const revenueList = nativeEl.querySelectorAll('.revenue-list');
    expect(revenueList.length).toBeGreaterThanOrEqual(1);
    const allText = Array.from(revenueList).map(r => r.textContent ?? '').join('');
    expect(allText).toContain('ZAR');
    expect(allText).toContain('NAD');
    expect(allText).toContain('15000.50');
  });

  it('renders vendor revenue', () => {
    const revenueItems = nativeEl.querySelectorAll('.revenue-item');
    expect(revenueItems.length).toBeGreaterThan(0);
  });

  it('humanizeStatus capitalises correctly', () => {
    expect(component.humanizeStatus('pending')).toBe('Pending');
    expect(component.humanizeStatus('cancelled')).toBe('Cancelled');
  });

  it('formatMoney uses R symbol for ZAR', () => {
    expect(component.formatMoney(100, CurrencyCode.ZAR)).toBe('R 100.00 ZAR');
  });

  it('formatMoney uses N$ symbol for NAD', () => {
    expect(component.formatMoney(200.5, CurrencyCode.NAD)).toBe('N$ 200.50 NAD');
  });
});

// ─── Analytics section ─────────────────────────────────────────────────────

describe('AdminDashboard — analytics section', () => {
  let component: AdminDashboard;
  let nativeEl: HTMLElement;
  let analyticsStub: AdminAnalyticsServiceStub;

  beforeEach(async () => {
    analyticsStub = defaultAnalyticsStub();
    ({ component, nativeEl } = await createComponent(defaultOrdersStub(), analyticsStub));
  });

  it('calls getSummary on init with no args (default range) and clears analytics loading', () => {
    expect(analyticsStub.getSummary).toHaveBeenCalledTimes(1);
    expect(analyticsStub.getSummary).toHaveBeenCalledWith();
    expect(component.analyticsLoading()).toBe(false);
    expect(component.analyticsError()).toBeNull();
  });

  it('sets analytics signal with returned data', () => {
    const data = component.analytics();
    expect(data).not.toBeNull();
    expect(data!.conversionRate).toBe(0.1);
  });

  it('renders all 7 funnel stages in enum order as bars with labels + counts', () => {
    const items = nativeEl.querySelectorAll('.funnel-item');
    expect(items.length).toBe(7);

    const labels = Array.from(items).map(i => i.querySelector('.funnel-label')?.textContent?.trim());
    expect(labels).toEqual([
      'Product viewed',
      'Add to cart',
      'Checkout started',
      'Shipping submitted',
      'Payment attempted',
      'Payment failed',
      'Order completed',
    ]);

    const counts = Array.from(items).map(i => i.querySelector('.funnel-count')?.textContent?.trim());
    expect(counts).toEqual(['100', '40', '20', '15', '12', '2', '10']);
  });

  it('sizes the widest funnel stage bar at 100% width', () => {
    const items = nativeEl.querySelectorAll('.funnel-item');
    const firstFill = items[0].querySelector('.funnel-bar-fill') as HTMLElement;
    expect(firstFill.style.width).toBe('100%');
  });

  it('renders conversion rate as a 1-decimal percentage', () => {
    const cards = nativeEl.querySelectorAll('.metric-card');
    const texts = Array.from(cards).map(c => c.textContent ?? '');
    expect(texts.some(t => t.includes('10.0%'))).toBe(true);
    expect(texts.some(t => t.includes('Conversion rate'))).toBe(true);
  });

  it('renders revenue-by-currency rows for ZAR and NAD separately (never summed)', () => {
    const items = nativeEl.querySelectorAll('.revenue-item');
    const allText = Array.from(items).map(i => i.textContent ?? '').join(' | ');
    expect(allText).toContain('ZAR');
    expect(allText).toContain('5000.25');
    expect(allText).toContain('NAD');
    expect(allText).toContain('1200.00');
  });

  it('renders a time-series row per bucket with date, orders, and revenue', () => {
    const rows = nativeEl.querySelectorAll('.timeseries-table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('2026-07-01');
    expect(rows[0].textContent).toContain('5');
    expect(rows[0].textContent).toContain('2500.00');
    expect(rows[1].textContent).toContain('2026-07-02');
    expect(rows[1].textContent).toContain('900.00');
  });

  it('formatPercent renders 1 decimal place', () => {
    expect(component.formatPercent(0.1)).toBe('10.0%');
    expect(component.formatPercent(0)).toBe('0.0%');
  });
});

// ─── Analytics zero/empty state ─────────────────────────────────────────────

describe('AdminDashboard — analytics zero/empty state', () => {
  it('renders zero-filled funnel bars and empty widgets without an error', async () => {
    const analyticsStub: AdminAnalyticsServiceStub = {
      getSummary: vi.fn(() => of({ ...ZERO_ANALYTICS })),
    };

    const { component, nativeEl } = await createComponent(defaultOrdersStub(), analyticsStub);

    expect(component.analyticsLoading()).toBe(false);
    expect(component.analyticsError()).toBeNull();
    expect(nativeEl.querySelector('.error-banner')).toBeNull();

    // All 7 funnel stages still render, zero-filled, all bars 0% width.
    const items = nativeEl.querySelectorAll('.funnel-item');
    expect(items.length).toBe(7);
    Array.from(items).forEach((item) => {
      const fill = item.querySelector('.funnel-bar-fill') as HTMLElement;
      expect(fill.style.width).toBe('0%');
    });

    // Conversion rate renders 0.0%, not NaN/Infinity.
    const cards = nativeEl.querySelectorAll('.metric-card');
    const texts = Array.from(cards).map(c => c.textContent ?? '');
    expect(texts.some(t => t.includes('0.0%'))).toBe(true);

    // Empty revenue + empty time series render empty-state copy, not a crash.
    const emptyMsgs = nativeEl.querySelectorAll('.metric-empty');
    expect(emptyMsgs.length).toBeGreaterThanOrEqual(2);
  });

  it('does not show an error banner for zero-filled analytics', async () => {
    const analyticsStub: AdminAnalyticsServiceStub = {
      getSummary: vi.fn(() => of({ ...ZERO_ANALYTICS })),
    };

    const { nativeEl } = await createComponent(defaultOrdersStub(), analyticsStub);

    expect(nativeEl.querySelector('.error-banner')).toBeNull();
  });
});

// ─── Analytics error path ───────────────────────────────────────────────────

describe('AdminDashboard — analytics load error path', () => {
  it('sets analyticsError and clears analyticsLoading when getSummary() fails', async () => {
    const analyticsStub: AdminAnalyticsServiceStub = {
      getSummary: vi.fn(() => throwError(() => new Error('500'))),
    };

    const { component, nativeEl } = await createComponent(defaultOrdersStub(), analyticsStub);

    expect(component.analyticsLoading()).toBe(false);
    expect(component.analyticsError()).toBeTruthy();
    expect(nativeEl.querySelector('.analytics-section .error-banner')).not.toBeNull();
  });

  it('an analytics failure does not affect the existing dashboard widgets', async () => {
    const analyticsStub: AdminAnalyticsServiceStub = {
      getSummary: vi.fn(() => throwError(() => new Error('500'))),
    };

    const { component } = await createComponent(defaultOrdersStub(), analyticsStub);

    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
    expect(component.dashboard()).not.toBeNull();
  });
});

// ─── All-zero / empty dashboard (existing widgets) ──────────────────────────

describe('AdminDashboard — zero/empty state', () => {
  it('renders gracefully with all-zero data and no arrays', async () => {
    const ordersStub: AdminOrdersServiceStub = {
      getDashboard: vi.fn(() => of({ ...ZERO_DASHBOARD })),
      listOrders: vi.fn(),
    };

    const { component, nativeEl } = await createComponent(ordersStub, defaultAnalyticsStub());

    // No crash
    expect(component).toBeTruthy();
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();

    // pendingVendorCount = 0 shown on CTA
    const cta = nativeEl.querySelector('.metric-card--cta');
    expect(cta!.textContent).toContain('0');

    // all-zero status → "No orders yet" message
    const emptyMsg = nativeEl.querySelector('.metric-empty');
    expect(emptyMsg).not.toBeNull();

    // empty revenue arrays → empty state messages
    const emptyMsgs = nativeEl.querySelectorAll('.metric-empty');
    expect(emptyMsgs.length).toBeGreaterThanOrEqual(2);
  });

  it('does not show an error banner for empty/zero data', async () => {
    const ordersStub: AdminOrdersServiceStub = {
      getDashboard: vi.fn(() => of({ ...ZERO_DASHBOARD })),
      listOrders: vi.fn(),
    };

    const { nativeEl } = await createComponent(ordersStub, defaultAnalyticsStub());

    const errorBanner = nativeEl.querySelector('.dashboard-page > .error-banner');
    expect(errorBanner).toBeNull();
  });
});

// ─── Error path (existing widgets) ──────────────────────────────────────────

describe('AdminDashboard — load error path', () => {
  it('sets error signal and clears loading when getDashboard() fails', async () => {
    const ordersStub: AdminOrdersServiceStub = {
      getDashboard: vi.fn(() => throwError(() => new Error('500'))),
      listOrders: vi.fn(),
    };

    const { component } = await createComponent(ordersStub, defaultAnalyticsStub());

    expect(component.loading()).toBe(false);
    expect(component.error()).toBeTruthy();
  });
});
