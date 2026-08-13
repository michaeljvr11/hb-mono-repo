import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminEarningsReportDto, CurrencyCode } from '@hb/shared';

import { AdminEarnings } from './admin-earnings';
import { AdminEarningsService } from '../../../../core/api/earnings.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_REPORT: AdminEarningsReportDto = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-10T12:00:00.000Z',
  vendors: [
    {
      vendorId: 'v1',
      businessName: 'Kalahari Traders',
      orderCount: 3,
      grossByCurrency: [
        { currency: CurrencyCode.ZAR, amount: 1000 },
        { currency: CurrencyCode.NAD, amount: 500 },
      ],
      commissionByCurrency: [
        { currency: CurrencyCode.ZAR, amount: 150 },
        { currency: CurrencyCode.NAD, amount: 75 },
      ],
      netByCurrency: [
        { currency: CurrencyCode.ZAR, amount: 850 },
        { currency: CurrencyCode.NAD, amount: 425 },
      ],
    },
    {
      vendorId: 'v2',
      businessName: 'Dormant Vendor',
      orderCount: 0,
      grossByCurrency: [],
      commissionByCurrency: [],
      netByCurrency: [],
    },
  ],
  platformCommissionByCurrency: [
    { currency: CurrencyCode.ZAR, amount: 150 },
    { currency: CurrencyCode.NAD, amount: 75 },
  ],
  platformListingGmvByCurrency: [{ currency: CurrencyCode.ZAR, amount: 2000 }],
  heldForVendorsByCurrency: [
    { currency: CurrencyCode.ZAR, amount: 850 },
    { currency: CurrencyCode.NAD, amount: 425 },
  ],
};

// ─── Stub shape ──────────────────────────────────────────────────────────────

interface AdminEarningsServiceStub {
  getReport: ReturnType<typeof vi.fn>;
}

/** Finds a rendered `.tab-btn` (owned by the nested `EarningsRangeSelector`)
 *  by its visible label. `fixture.nativeElement.querySelectorAll` traverses
 *  the whole rendered subtree regardless of component boundaries — Angular's
 *  emulated encapsulation is still a single real DOM tree. */
function findTab(fixture: ComponentFixture<AdminEarnings>, label: string): HTMLButtonElement {
  const tabs: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.tab-btn'));
  const tab = tabs.find((btn) => btn.textContent?.trim() === label);
  if (!tab) throw new Error(`No tab found with label "${label}"`);
  return tab;
}

// ─── Component integration tests ─────────────────────────────────────────────

describe('AdminEarnings component', () => {
  let component: AdminEarnings;
  let fixture: ComponentFixture<AdminEarnings>;
  let stub: AdminEarningsServiceStub;

  beforeEach(async () => {
    stub = {
      getReport: vi.fn(() => of(MOCK_REPORT)),
    };

    await TestBed.configureTestingModule({
      imports: [AdminEarnings],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: AdminEarningsService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminEarnings);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the report on init with the default 1m window', () => {
    expect(stub.getReport).toHaveBeenCalledTimes(1);
    expect(stub.getReport).toHaveBeenCalledWith({ window: '1m' });
    expect(component.loading()).toBe(false);
    expect(component.report()).toEqual(MOCK_REPORT);
  });

  it('the "Last month" tab label includes the actual month name, not a generic label', () => {
    const tabs: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.tab-btn'));
    const labels = tabs.map((btn) => btn.textContent?.trim());
    const monthLabel = labels.find((label) => !['Last week', 'Last 2 weeks', 'All time'].includes(label ?? ''));
    expect(monthLabel).toBeTruthy();
    expect(monthLabel).toMatch(/^[A-Z][a-z]+ \d{4}$/);
  });

  it('selecting "Last week" issues a request with window: "1w"', () => {
    findTab(fixture, 'Last week').click();
    fixture.detectChanges();

    expect(stub.getReport).toHaveBeenCalledTimes(2);
    expect(stub.getReport).toHaveBeenLastCalledWith({ window: '1w' });
    expect(component.currentQuery()).toEqual({ window: '1w' });
  });

  it('selecting "Last 2 weeks" issues a request with window: "2w"', () => {
    findTab(fixture, 'Last 2 weeks').click();
    fixture.detectChanges();

    expect(stub.getReport).toHaveBeenCalledTimes(2);
    expect(stub.getReport).toHaveBeenLastCalledWith({ window: '2w' });
    expect(component.currentQuery()).toEqual({ window: '2w' });
  });

  it('selecting "All time" issues a request with window: "all" and renders "All time" instead of the sentinel date', () => {
    findTab(fixture, 'All time').click();
    fixture.detectChanges();

    expect(stub.getReport).toHaveBeenCalledTimes(2);
    expect(stub.getReport).toHaveBeenLastCalledWith({ window: 'all' });
    expect(component.currentQuery()).toEqual({ window: 'all' });

    const subHeader = fixture.nativeElement.querySelector('.range-sub');
    expect(subHeader.textContent.trim()).toBe('All time');

    // The epoch sentinel the server echoes back as `from` under 'all' must
    // never leak into any rendered tab label (regression guard for FAIL 1).
    const allTimeTabs: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.tab-btn'));
    const tabLabels = allTimeTabs.map((btn) => btn.textContent?.trim() ?? '');
    expect(tabLabels.some((label) => label.includes('1970'))).toBe(false);
  });

  it('re-selecting the already-active window is a no-op (no extra request)', () => {
    const activeTab: HTMLButtonElement = fixture.nativeElement.querySelector('.tab-btn--active');
    activeTab.click();
    fixture.detectChanges();

    expect(stub.getReport).toHaveBeenCalledTimes(1);
  });

  it('renders both ZAR and NAD per-currency amounts for a multi-currency vendor, never summed', () => {
    const vendor = MOCK_REPORT.vendors[0];
    const currencies = component.vendorCurrencies(vendor);

    expect(currencies).toEqual([CurrencyCode.ZAR, CurrencyCode.NAD]);
    expect(component.vendorGross(vendor, CurrencyCode.ZAR)).toBe(1000);
    expect(component.vendorGross(vendor, CurrencyCode.NAD)).toBe(500);
    expect(component.formatMoney(1000, CurrencyCode.ZAR)).toBe('R 1000.00 ZAR');
    expect(component.formatMoney(500, CurrencyCode.NAD)).toBe('N$ 500.00 NAD');

    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('R 1000.00 ZAR');
    expect(html).toContain('N$ 500.00 NAD');
    // Headline commission figure renders each currency separately too.
    expect(html).toContain('R 150.00 ZAR');
    expect(html).toContain('N$ 75.00 NAD');
  });

  it('a vendor with zero eligible activity renders explicit "no activity" markers, not blanks', () => {
    const dormant = MOCK_REPORT.vendors[1];
    expect(component.vendorCurrencies(dormant)).toEqual([]);

    const rows = fixture.nativeElement.querySelectorAll('.vendor-table tbody tr');
    expect(rows.length).toBe(2);
    const dormantCells = rows[1].querySelectorAll('.vendor-money-cell');
    dormantCells.forEach((cell: HTMLElement) => {
      expect(cell.textContent?.trim()).toBe('—');
    });
  });
});

// ─── Empty vendors state ──────────────────────────────────────────────────────

describe('AdminEarnings — empty vendors state', () => {
  it('renders a clear empty state, not a blank table, when there are no approved vendors', async () => {
    const emptyReport: AdminEarningsReportDto = { ...MOCK_REPORT, vendors: [] };
    const stub: AdminEarningsServiceStub = {
      getReport: vi.fn(() => of(emptyReport)),
    };

    await TestBed.configureTestingModule({
      imports: [AdminEarnings],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: AdminEarningsService, useValue: stub },
      ],
    }).compileComponents();

    const emptyFixture = TestBed.createComponent(AdminEarnings);
    emptyFixture.detectChanges();
    await emptyFixture.whenStable();

    const emptyState = emptyFixture.nativeElement.querySelector('.list-empty');
    expect(emptyState).toBeTruthy();
    expect(emptyFixture.nativeElement.querySelector('.vendor-table')).toBeFalsy();
  });
});

// ─── Load error path ──────────────────────────────────────────────────────────

describe('AdminEarnings — load error path', () => {
  it('sets error signal and clears loading when getReport() fails', async () => {
    const failStub: AdminEarningsServiceStub = {
      getReport: vi.fn(() => throwError(() => new Error('500'))),
    };

    await TestBed.configureTestingModule({
      imports: [AdminEarnings],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: AdminEarningsService, useValue: failStub },
      ],
    }).compileComponents();

    const failFixture = TestBed.createComponent(AdminEarnings);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.loading()).toBe(false);
    expect(failComponent.error()).toBeTruthy();
  });
});
