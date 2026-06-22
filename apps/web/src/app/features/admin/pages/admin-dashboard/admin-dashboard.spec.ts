import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminDashboardDto, CurrencyCode, OrderStatus } from '@hb/shared';

import { AdminDashboard } from './admin-dashboard';
import { AdminOrdersService } from '../../../../core/api/admin-orders.service';

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

// ─── Service stub ────────────────────────────────────────────────────────────

interface AdminOrdersServiceStub {
  getDashboard: ReturnType<typeof vi.fn>;
  listOrders: ReturnType<typeof vi.fn>;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function createComponent(stub: AdminOrdersServiceStub): Promise<{
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
      { provide: AdminOrdersService, useValue: stub },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AdminDashboard);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();

  return { component, fixture, nativeEl: fixture.nativeElement as HTMLElement };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AdminDashboard component', () => {
  let component: AdminDashboard;
  let fixture: ComponentFixture<AdminDashboard>;
  let nativeEl: HTMLElement;
  let stub: AdminOrdersServiceStub;

  beforeEach(async () => {
    stub = {
      getDashboard: vi.fn(() => of({ ...MOCK_DASHBOARD })),
      listOrders: vi.fn(),
    };

    ({ component, fixture, nativeEl } = await createComponent(stub));
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('calls getDashboard on init and clears loading', () => {
    expect(stub.getDashboard).toHaveBeenCalledTimes(1);
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

// ─── All-zero / empty dashboard ──────────────────────────────────────────────

describe('AdminDashboard — zero/empty state', () => {
  it('renders gracefully with all-zero data and no arrays', async () => {
    const stub: AdminOrdersServiceStub = {
      getDashboard: vi.fn(() => of({ ...ZERO_DASHBOARD })),
      listOrders: vi.fn(),
    };

    const { component, nativeEl } = await createComponent(stub);

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
    const stub: AdminOrdersServiceStub = {
      getDashboard: vi.fn(() => of({ ...ZERO_DASHBOARD })),
      listOrders: vi.fn(),
    };

    const { nativeEl } = await createComponent(stub);

    const errorBanner = nativeEl.querySelector('.error-banner');
    expect(errorBanner).toBeNull();
  });
});

// ─── Error path ──────────────────────────────────────────────────────────────

describe('AdminDashboard — load error path', () => {
  it('sets error signal and clears loading when getDashboard() fails', async () => {
    const stub: AdminOrdersServiceStub = {
      getDashboard: vi.fn(() => throwError(() => new Error('500'))),
      listOrders: vi.fn(),
    };

    const { component } = await createComponent(stub);

    expect(component.loading()).toBe(false);
    expect(component.error()).toBeTruthy();
  });
});
