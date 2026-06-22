import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CurrencyCode, VendorDashboardDto } from '@hb/shared';

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

// ─── Stub ────────────────────────────────────────────────────────────────────

interface VendorsStub {
  getDashboard: ReturnType<typeof vi.fn>;
}

function makeStub(dashboardData: VendorDashboardDto = MOCK_DASHBOARD): VendorsStub {
  return { getDashboard: vi.fn(() => of(dashboardData)) };
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
