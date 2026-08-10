import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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

// ─── Stub shape ──────────────────────────────────────────────────────────────

interface VendorEarningsServiceStub {
  getReport: ReturnType<typeof vi.fn>;
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
    const monthTab = component.windowTabs().find((t) => t.value === '1m');
    expect(monthTab).toBeTruthy();
    expect(monthTab!.label).not.toBe('Last month');
    expect(monthTab!.label).toMatch(/^[A-Z][a-z]+ \d{4}$/);
  });

  it('selecting "Last week" issues a request with window: "1w" and refetches', () => {
    component.setWindow('1w');

    expect(stub.getReport).toHaveBeenCalledTimes(2);
    expect(stub.getReport).toHaveBeenLastCalledWith({ window: '1w' });
    expect(component.selectedWindow()).toBe('1w');
  });

  it('selecting "Last 2 weeks" issues a request with window: "2w" and refetches', () => {
    component.setWindow('2w');

    expect(stub.getReport).toHaveBeenCalledTimes(2);
    expect(stub.getReport).toHaveBeenLastCalledWith({ window: '2w' });
    expect(component.selectedWindow()).toBe('2w');
  });

  it('re-selecting the already-active window is a no-op (no extra request)', () => {
    component.setWindow('1m');

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
