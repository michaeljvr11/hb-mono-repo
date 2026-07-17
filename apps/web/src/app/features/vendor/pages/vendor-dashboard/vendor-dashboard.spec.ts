import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsEventType, CurrencyCode, VendorAnalyticsDto, VendorDashboardDto } from '@hb/shared';

import { VendorDashboard } from './vendor-dashboard';
import { VendorsService } from '../../../../core/api/vendors.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_DASHBOARD: VendorDashboardDto = {
  productCount: 12,
  orderCountByStatus: { pending: 3, delivered: 7 },
  totalRevenue: 14250.5,
  currency: CurrencyCode.ZAR,
};

const EMPTY_DASHBOARD: VendorDashboardDto = {
  productCount: 0,
  orderCountByStatus: {},
  totalRevenue: 0,
  currency: CurrencyCode.ZAR,
};

const MOCK_ANALYTICS: VendorAnalyticsDto = {
  funnel: [
    { stage: AnalyticsEventType.PRODUCT_VIEWED, sessions: 80 },
    { stage: AnalyticsEventType.ADD_TO_CART, sessions: 30 },
    { stage: AnalyticsEventType.CHECKOUT_STARTED, sessions: 0 },
    { stage: AnalyticsEventType.SHIPPING_SUBMITTED, sessions: 0 },
    { stage: AnalyticsEventType.PAYMENT_ATTEMPTED, sessions: 0 },
    { stage: AnalyticsEventType.PAYMENT_FAILED, sessions: 0 },
    { stage: AnalyticsEventType.ORDER_COMPLETED, sessions: 0 },
  ],
  orderCount: 9,
  revenueByCurrency: [
    { currency: CurrencyCode.ZAR, amount: 4200.75 },
    { currency: CurrencyCode.NAD, amount: 900 },
  ],
  timeSeries: [
    {
      date: '2026-07-01',
      orders: 4,
      revenueByCurrency: [{ currency: CurrencyCode.ZAR, amount: 2100.5 }],
    },
    {
      date: '2026-07-02',
      orders: 5,
      revenueByCurrency: [
        { currency: CurrencyCode.ZAR, amount: 2100.25 },
        { currency: CurrencyCode.NAD, amount: 900 },
      ],
    },
  ],
};

const EMPTY_ANALYTICS: VendorAnalyticsDto = {
  funnel: [
    { stage: AnalyticsEventType.PRODUCT_VIEWED, sessions: 0 },
    { stage: AnalyticsEventType.ADD_TO_CART, sessions: 0 },
    { stage: AnalyticsEventType.CHECKOUT_STARTED, sessions: 0 },
    { stage: AnalyticsEventType.SHIPPING_SUBMITTED, sessions: 0 },
    { stage: AnalyticsEventType.PAYMENT_ATTEMPTED, sessions: 0 },
    { stage: AnalyticsEventType.PAYMENT_FAILED, sessions: 0 },
    { stage: AnalyticsEventType.ORDER_COMPLETED, sessions: 0 },
  ],
  orderCount: 0,
  revenueByCurrency: [],
  timeSeries: [],
};

// ─── Stub ────────────────────────────────────────────────────────────────────

interface VendorsStub {
  getDashboard: ReturnType<typeof vi.fn>;
  getAnalytics: ReturnType<typeof vi.fn>;
}

function makeStub(
  dashboardData: VendorDashboardDto = MOCK_DASHBOARD,
  analyticsData: VendorAnalyticsDto = MOCK_ANALYTICS,
): VendorsStub {
  return {
    getDashboard: vi.fn(() => of(dashboardData)),
    getAnalytics: vi.fn(() => of(analyticsData)),
  };
}

async function setupTestBed(stub: VendorsStub): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [VendorDashboard],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: VendorsService, useValue: stub },
    ],
  }).compileComponents();
}

// ─── Main suite (with real data) ─────────────────────────────────────────────

describe('VendorDashboard component', () => {
  let component: VendorDashboard;
  let fixture: ComponentFixture<VendorDashboard>;
  let stub: VendorsStub;

  beforeEach(async () => {
    stub = makeStub();
    await setupTestBed(stub);
    fixture = TestBed.createComponent(VendorDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('calls getDashboard on init', () => {
    expect(stub.getDashboard).toHaveBeenCalledTimes(1);
  });

  it('sets dashboard signal from the API response', () => {
    expect(component.dashboard()).toEqual(MOCK_DASHBOARD);
  });

  it('clears loading after successful fetch', () => {
    expect(component.loading()).toBe(false);
  });

  it('error signal is null on success', () => {
    expect(component.error()).toBeNull();
  });

  it('totalOrders sums all order counts across statuses', () => {
    // pending: 3 + delivered: 7 = 10
    expect(component.totalOrders()).toBe(10);
  });

  it('currency is ZAR', () => {
    expect(component.dashboard()?.currency).toBe(CurrencyCode.ZAR);
  });
});

// ─── Empty-state suite ────────────────────────────────────────────────────────

describe('VendorDashboard — empty state (zero data)', () => {
  let component: VendorDashboard;
  let fixture: ComponentFixture<VendorDashboard>;

  beforeEach(async () => {
    await setupTestBed(makeStub(EMPTY_DASHBOARD));
    fixture = TestBed.createComponent(VendorDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('shows zero productCount without setting an error', () => {
    expect(component.dashboard()?.productCount).toBe(0);
    expect(component.error()).toBeNull();
  });

  it('shows zero totalRevenue without setting an error', () => {
    expect(component.dashboard()?.totalRevenue).toBe(0);
    expect(component.error()).toBeNull();
  });

  it('totalOrders returns 0 when orderCountByStatus is empty', () => {
    expect(component.totalOrders()).toBe(0);
  });

  it('clears loading after empty fetch', () => {
    expect(component.loading()).toBe(false);
  });
});

// ─── Error path ───────────────────────────────────────────────────────────────

describe('VendorDashboard — API error', () => {
  let component: VendorDashboard;
  let fixture: ComponentFixture<VendorDashboard>;

  beforeEach(async () => {
    const failStub: VendorsStub = {
      getDashboard: vi.fn(() => throwError(() => new Error('500'))),
      getAnalytics: vi.fn(() => of(MOCK_ANALYTICS)),
    };
    await setupTestBed(failStub);
    fixture = TestBed.createComponent(VendorDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('sets error signal when getDashboard fails', () => {
    expect(component.error()).toBeTruthy();
  });

  it('clears loading after failure', () => {
    expect(component.loading()).toBe(false);
  });

  it('dashboard signal remains null after failure', () => {
    expect(component.dashboard()).toBeNull();
  });
});

// ─── Analytics section ──────────────────────────────────────────────────────

describe('VendorDashboard — analytics (with data)', () => {
  let component: VendorDashboard;
  let fixture: ComponentFixture<VendorDashboard>;
  let stub: VendorsStub;

  beforeEach(async () => {
    stub = makeStub();
    await setupTestBed(stub);
    fixture = TestBed.createComponent(VendorDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('calls getAnalytics on init', () => {
    expect(stub.getAnalytics).toHaveBeenCalledTimes(1);
  });

  it('sets analytics signal from the API response', () => {
    expect(component.analytics()).toEqual(MOCK_ANALYTICS);
  });

  it('clears analyticsLoading after successful fetch', () => {
    expect(component.analyticsLoading()).toBe(false);
  });

  it('analyticsError is null on success', () => {
    expect(component.analyticsError()).toBeNull();
  });

  it('maxFunnelSessions is the busiest stage count', () => {
    expect(component.maxFunnelSessions()).toBe(80);
  });

  it('funnelWidth scales relative to the busiest stage', () => {
    expect(component.funnelWidth(80)).toBe(100);
    expect(component.funnelWidth(30)).toBeCloseTo(37.5);
    expect(component.funnelWidth(0)).toBe(0);
  });

  it('renders all 7 funnel stages as rows', () => {
    const rows = fixture.nativeElement.querySelectorAll('.funnel-row');
    expect(rows.length).toBe(7);
  });

  it('renders zero-width bar + count for a zero-session stage (checkout)', () => {
    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.funnel-row');
    const checkoutRow = Array.from(rows).find((row) =>
      row.textContent?.includes('Checkout Started'),
    );
    expect(checkoutRow).toBeTruthy();
    expect(checkoutRow?.textContent).toContain('0');
    const bar = checkoutRow?.querySelector('.funnel-row__bar') as HTMLElement;
    expect(bar.style.width).toBe('0%');
  });

  it('renders one revenue row per currency (ZAR and NAD separate, never summed)', () => {
    const rows = fixture.nativeElement.querySelectorAll('.currency-row');
    expect(rows.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('R');
    expect(fixture.nativeElement.textContent).toContain('4,200.75');
    expect(fixture.nativeElement.textContent).toContain('900.00');
  });

  it('renders one time-series row per bucket plus the header row', () => {
    const rows = fixture.nativeElement.querySelectorAll('.timeseries-row');
    // 1 header row + 2 data rows
    expect(rows.length).toBe(3);
  });

  it('currencySymbol maps ZAR to R and NAD to N$', () => {
    expect(component.currencySymbol(CurrencyCode.ZAR)).toBe('R');
    expect(component.currencySymbol(CurrencyCode.NAD)).toBe('N$');
  });
});

describe('VendorDashboard — analytics empty state (zero data)', () => {
  let component: VendorDashboard;
  let fixture: ComponentFixture<VendorDashboard>;

  beforeEach(async () => {
    await setupTestBed(makeStub(MOCK_DASHBOARD, EMPTY_ANALYTICS));
    fixture = TestBed.createComponent(VendorDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders zero-filled funnel rows without an error', () => {
    expect(component.analyticsError()).toBeNull();
    const rows = fixture.nativeElement.querySelectorAll('.funnel-row');
    expect(rows.length).toBe(7);
  });

  it('maxFunnelSessions is 0 and does not divide by zero', () => {
    expect(component.maxFunnelSessions()).toBe(0);
    expect(component.funnelWidth(0)).toBe(0);
  });

  it('renders the empty-revenue message instead of an error', () => {
    expect(fixture.nativeElement.textContent).toContain('No revenue in this range yet.');
    expect(component.analyticsError()).toBeNull();
  });

  it('renders the empty-time-series message instead of an error', () => {
    expect(fixture.nativeElement.textContent).toContain('No orders in this range yet.');
  });
});

describe('VendorDashboard — analytics API error', () => {
  let component: VendorDashboard;
  let fixture: ComponentFixture<VendorDashboard>;

  beforeEach(async () => {
    const failStub: VendorsStub = {
      getDashboard: vi.fn(() => of(MOCK_DASHBOARD)),
      getAnalytics: vi.fn(() => throwError(() => new Error('500'))),
    };
    await setupTestBed(failStub);
    fixture = TestBed.createComponent(VendorDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('sets analyticsError when getAnalytics fails', () => {
    expect(component.analyticsError()).toBeTruthy();
  });

  it('clears analyticsLoading after failure', () => {
    expect(component.analyticsLoading()).toBe(false);
  });

  it('analytics signal remains null after failure', () => {
    expect(component.analytics()).toBeNull();
  });

  it('does not affect the unrelated dashboard signal', () => {
    expect(component.dashboard()).toEqual(MOCK_DASHBOARD);
    expect(component.error()).toBeNull();
  });
});
