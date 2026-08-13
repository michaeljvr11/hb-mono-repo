import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CurrencyCode, VendorEarningsReportDto } from '@hb/shared';

import { VendorEarnings } from './vendor-earnings';
import { VendorEarningsService } from '../../../../core/api/vendor-earnings.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_REPORT: VendorEarningsReportDto = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-10T12:00:00.000Z',
  summary: {
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
  balance: {
    pendingClaimWindowByCurrency: [{ currency: CurrencyCode.ZAR, amount: 200 }],
    accruedByCurrency: [
      { currency: CurrencyCode.ZAR, amount: 850 },
      { currency: CurrencyCode.NAD, amount: 425 },
    ],
  },
  settlementPreview: [
    {
      periodStart: '2026-07-18T00:00:00.000Z',
      periodEnd: '2026-08-01T00:00:00.000Z',
      orderCount: 2,
      netByCurrency: [{ currency: CurrencyCode.ZAR, amount: 600 }],
      status: 'closed',
    },
    {
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-08-15T00:00:00.000Z',
      orderCount: 1,
      netByCurrency: [{ currency: CurrencyCode.ZAR, amount: 250 }],
      status: 'open',
    },
  ],
};

const EMPTY_REPORT: VendorEarningsReportDto = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-10T12:00:00.000Z',
  summary: {
    vendorId: 'v1',
    businessName: 'Kalahari Traders',
    orderCount: 0,
    grossByCurrency: [],
    commissionByCurrency: [],
    netByCurrency: [],
  },
  balance: {
    pendingClaimWindowByCurrency: [],
    accruedByCurrency: [],
  },
  settlementPreview: [
    {
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-08-15T00:00:00.000Z',
      orderCount: 0,
      netByCurrency: [],
      status: 'open',
    },
  ],
};

/** Builds a long "All time"-style settlement history: `closedCount` closed
 *  periods followed by the single always-present trailing 'open' period —
 *  matching `settlementPreview`'s documented ordering. */
function buildLongSettlementHistory(closedCount: number) {
  const closed = Array.from({ length: closedCount }, (_, i) => ({
    periodStart: new Date(2020, 0, 1 + i * 14).toISOString(),
    periodEnd: new Date(2020, 0, 15 + i * 14).toISOString(),
    orderCount: 1,
    netByCurrency: [{ currency: CurrencyCode.ZAR, amount: 100 }],
    status: 'closed' as const,
  }));
  const open = {
    periodStart: new Date(2026, 7, 1).toISOString(),
    periodEnd: new Date(2026, 7, 15).toISOString(),
    orderCount: 0,
    netByCurrency: [],
    status: 'open' as const,
  };
  return [...closed, open];
}

// ─── Stub shape ──────────────────────────────────────────────────────────────

interface VendorEarningsServiceStub {
  getReport: ReturnType<typeof vi.fn>;
}

/** Finds a rendered `.tab-btn` (owned by the nested `EarningsRangeSelector`)
 *  by its visible label. `fixture.nativeElement.querySelectorAll` traverses
 *  the whole rendered subtree regardless of component boundaries — Angular's
 *  emulated encapsulation is still a single real DOM tree. */
function findTab(fixture: ComponentFixture<VendorEarnings>, label: string): HTMLButtonElement {
  const tabs: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.tab-btn'));
  const tab = tabs.find((btn) => btn.textContent?.trim() === label);
  if (!tab) throw new Error(`No tab found with label "${label}"`);
  return tab;
}

// ─── Component integration tests ─────────────────────────────────────────────

describe('VendorEarnings component', () => {
  let component: VendorEarnings;
  let fixture: ComponentFixture<VendorEarnings>;
  let stub: VendorEarningsServiceStub;

  beforeEach(async () => {
    stub = {
      getReport: vi.fn(() => of(MOCK_REPORT)),
    };

    await TestBed.configureTestingModule({
      imports: [VendorEarnings],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: VendorEarningsService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorEarnings);
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

  it('selecting "Last week" issues a request with window: "1w" and refetches', () => {
    findTab(fixture, 'Last week').click();
    fixture.detectChanges();

    expect(stub.getReport).toHaveBeenCalledTimes(2);
    expect(stub.getReport).toHaveBeenLastCalledWith({ window: '1w' });
    expect(component.currentQuery()).toEqual({ window: '1w' });
  });

  it('selecting "Last 2 weeks" issues a request with window: "2w" and refetches', () => {
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

  it('renders both ZAR and NAD summary figures separately, never summed', () => {
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('R 1000.00 ZAR');
    expect(html).toContain('N$ 500.00 NAD');
    expect(html).toContain('R 150.00 ZAR');
    expect(html).toContain('N$ 75.00 NAD');
    expect(html).toContain('R 850.00 ZAR');
    expect(html).toContain('N$ 425.00 NAD');
  });

  it('renders the balance split with the AC-mandated plain-language labels', () => {
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('Awaiting 48-hour claim window');
    expect(html).toContain('Accrued and eligible');
    expect(html).toContain('R 200.00 ZAR');
  });

  it('renders the "statement, not payment" copy', () => {
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('statement, not a payment');
    expect(html).toContain('no payout has been executed');
    expect(html).toContain('48-hour damage-claim window');
  });

  it('renders settlement periods, distinguishing open from closed', () => {
    const rows = fixture.nativeElement.querySelectorAll('.settlement-table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Closed');
    expect(rows[1].textContent).toContain('Current period');
    const html = fixture.nativeElement.textContent as string;
    expect(html).toContain('R 600.00 ZAR');
    expect(html).toContain('R 250.00 ZAR');
  });

  it('does not render pagination controls when the history fits on one page', () => {
    expect(fixture.nativeElement.querySelector('.settlement-pagination')).toBeFalsy();
  });
});

// ─── Empty / zero-activity state ──────────────────────────────────────────────

describe('VendorEarnings — empty/zero-activity state', () => {
  it('renders a clear empty state, not a blank table, when there is no eligible activity', async () => {
    const stub: VendorEarningsServiceStub = {
      getReport: vi.fn(() => of(EMPTY_REPORT)),
    };

    await TestBed.configureTestingModule({
      imports: [VendorEarnings],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: VendorEarningsService, useValue: stub },
      ],
    }).compileComponents();

    const emptyFixture = TestBed.createComponent(VendorEarnings);
    emptyFixture.detectChanges();
    await emptyFixture.whenStable();

    expect(emptyFixture.nativeElement.querySelector('.list-empty')).toBeTruthy();
    expect(emptyFixture.nativeElement.querySelector('.summary-table')).toBeFalsy();

    // The single always-present 'open' settlement period still renders, all-zero.
    const rows = emptyFixture.nativeElement.querySelectorAll('.settlement-table tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Current period');
    expect(rows[0].querySelector('.metric-empty')).toBeTruthy();
  });
});

// ─── Settlement pagination (wide/"All time" history) ───────────────────────────

describe('VendorEarnings — settlement pagination', () => {
  it('paginates a long settlement history and defaults to the last page so the open period is immediately visible', async () => {
    const longReport: VendorEarningsReportDto = {
      ...MOCK_REPORT,
      settlementPreview: buildLongSettlementHistory(23), // 23 closed + 1 open = 24 → 3 pages of 10
    };
    const stub: VendorEarningsServiceStub = {
      getReport: vi.fn(() => of(longReport)),
    };

    await TestBed.configureTestingModule({
      imports: [VendorEarnings],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: VendorEarningsService, useValue: stub },
      ],
    }).compileComponents();

    const longFixture = TestBed.createComponent(VendorEarnings);
    const longComponent = longFixture.componentInstance;
    longFixture.detectChanges();
    await longFixture.whenStable();

    expect(longComponent.settlementPage()).toBe(3);
    const rows = longFixture.nativeElement.querySelectorAll('.settlement-table tbody tr');
    expect(rows.length).toBe(4); // periods 21-23 (closed) + the trailing open period
    expect(rows[rows.length - 1].textContent).toContain('Current period');

    const pagination = longFixture.nativeElement.querySelector('.settlement-pagination');
    expect(pagination).toBeTruthy();
    expect(pagination.textContent).toContain('Page 3 of 3');

    const prevBtn: HTMLButtonElement = longFixture.nativeElement.querySelector('.pagination-btn');
    prevBtn.click();
    longFixture.detectChanges();

    expect(longComponent.settlementPage()).toBe(2);
    const page2Rows = longFixture.nativeElement.querySelectorAll('.settlement-table tbody tr');
    expect(page2Rows.length).toBe(10);
  });
});

// ─── Load error path ──────────────────────────────────────────────────────────

describe('VendorEarnings — load error path', () => {
  it('sets error signal and clears loading when getReport() fails', async () => {
    const failStub: VendorEarningsServiceStub = {
      getReport: vi.fn(() => throwError(() => new Error('500'))),
    };

    await TestBed.configureTestingModule({
      imports: [VendorEarnings],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNativeDateAdapter(),
        { provide: VendorEarningsService, useValue: failStub },
      ],
    }).compileComponents();

    const failFixture = TestBed.createComponent(VendorEarnings);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.loading()).toBe(false);
    expect(failComponent.error()).toBeTruthy();
    const el: HTMLElement = failFixture.nativeElement;
    expect(el.querySelector('.error-banner')).toBeTruthy();
  });
});
