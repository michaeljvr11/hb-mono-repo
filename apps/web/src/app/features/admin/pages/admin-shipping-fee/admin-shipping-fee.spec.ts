import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError, NEVER } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CountryCode, CurrencyCode, ShippingFeeHistoryDto, ShippingFeeSetDto } from '@hb/shared';

import { AdminShippingFee } from './admin-shipping-fee';
import { ShippingFeeService } from '../../../../core/api/shipping-fee.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

function makeFees(amount: number, effectiveFrom: string, note?: string) {
  const routes: Array<[CountryCode, CountryCode]> = [
    [CountryCode.SOUTH_AFRICA, CountryCode.SOUTH_AFRICA],
    [CountryCode.SOUTH_AFRICA, CountryCode.NAMIBIA],
    [CountryCode.NAMIBIA, CountryCode.NAMIBIA],
    [CountryCode.NAMIBIA, CountryCode.SOUTH_AFRICA],
  ];
  const currencies: CurrencyCode[] = [CurrencyCode.ZAR, CurrencyCode.NAD];
  let i = 0;
  return routes.flatMap(([originCountry, destinationCountry]) =>
    currencies.map(currency => ({
      id: `fee-${effectiveFrom}-${i++}`,
      amount,
      currency,
      originCountry,
      destinationCountry,
      effectiveFrom,
      note,
      createdAt: effectiveFrom,
    })),
  );
}

const CURRENT_SET: ShippingFeeSetDto = {
  effectiveFrom: '2026-06-01T00:00:00.000Z',
  fees: makeFees(75.5, '2026-06-01T00:00:00.000Z'),
  inForce: true,
};

const SEEDED_SET: ShippingFeeSetDto = {
  effectiveFrom: '1970-01-01T00:00:00.000Z',
  fees: makeFees(0, '1970-01-01T00:00:00.000Z'),
  inForce: false,
};

const MOCK_HISTORY: ShippingFeeHistoryDto = { items: [CURRENT_SET, SEEDED_SET] };

// ─── Stub shape ──────────────────────────────────────────────────────────────

interface ShippingFeeServiceStub {
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  current: ReturnType<typeof vi.fn>;
}

function fillValidForm(component: AdminShippingFee, amount = '50.00'): void {
  for (const control of Object.values(component.form.controls.cells.controls)) {
    control.setValue(amount);
  }
}

// ─── Component integration tests ─────────────────────────────────────────────

describe('AdminShippingFee component', () => {
  let component: AdminShippingFee;
  let fixture: ComponentFixture<AdminShippingFee>;
  let stub: ShippingFeeServiceStub;

  beforeEach(async () => {
    stub = {
      list: vi.fn(() => of({ items: [CURRENT_SET, SEEDED_SET] })),
      create: vi.fn(),
      current: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminShippingFee],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ShippingFeeService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminShippingFee);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads and renders the current in-force set + history on init', () => {
    expect(stub.list).toHaveBeenCalledTimes(1);
    expect(component.loading()).toBe(false);
    expect(component.sets().length).toBe(2);
    expect(component.currentSet()?.effectiveFrom).toBe('2026-06-01T00:00:00.000Z');
    expect(component.currentSet()?.fees.length).toBe(8);
  });

  it('renders the seeded all-zero set when it is the only set (first load)', async () => {
    stub.list.mockReturnValue(of({ items: [SEEDED_SET] }));
    const seededFixture = TestBed.createComponent(AdminShippingFee);
    seededFixture.detectChanges();
    await seededFixture.whenStable();

    const seededComponent = seededFixture.componentInstance;
    expect(seededComponent.currentSet()).toBeNull();
    expect(seededComponent.sets()[0].fees.every(f => f.amount === 0)).toBe(true);
  });

  it('renders the fee grid with 4 routes and 8 cells', () => {
    const html = fixture.nativeElement as HTMLElement;
    const inputs = html.querySelectorAll('.fee-grid--editable input');
    expect(inputs.length).toBe(8);
  });

  it('submitting a complete, valid fee set calls create() with all 8 entries and refreshes', async () => {
    const created = { ...CURRENT_SET, effectiveFrom: '2026-07-01T00:00:00.000Z' };
    stub.create.mockReturnValue(of(created));
    stub.list.mockReturnValue(of({ items: [created, CURRENT_SET, SEEDED_SET] }));

    fillValidForm(component, '82.50');
    component.form.controls.note.setValue('Q3 update');
    component.submit();
    await fixture.whenStable();

    expect(stub.create).toHaveBeenCalledTimes(1);
    const payload = stub.create.mock.calls[0][0];
    expect(payload.fees.length).toBe(8);
    expect(payload.fees.every((f: { amount: number }) => f.amount === 82.5)).toBe(true);
    expect(payload.note).toBe('Q3 update');
    expect(payload.effectiveFrom).toBeUndefined();
    expect(stub.list).toHaveBeenCalledTimes(2);
    expect(component.pending()).toBe(false);
  });

  it('omits effectiveFrom entirely when the field is left blank', async () => {
    stub.create.mockReturnValue(of(CURRENT_SET));
    fillValidForm(component);
    component.submit();
    await fixture.whenStable();

    const payload = stub.create.mock.calls[0][0];
    expect('effectiveFrom' in payload).toBe(false);
  });

  it('converts a filled-in effectiveFrom to ISO before submitting', async () => {
    stub.create.mockReturnValue(of(CURRENT_SET));
    fillValidForm(component);
    component.form.controls.effectiveFrom.setValue('2026-08-01T10:00');
    component.submit();
    await fixture.whenStable();

    const payload = stub.create.mock.calls[0][0];
    expect(payload.effectiveFrom).toBe(new Date('2026-08-01T10:00').toISOString());
  });

  it('rejects an invalid effectiveFrom date without throwing and without submitting', () => {
    fillValidForm(component);
    component.form.controls.effectiveFrom.setValue('not-a-date');

    expect(() => component.submit()).not.toThrow();
    expect(component.submitError()).toBe('Effective date is not a valid date/time.');
    expect(stub.create).not.toHaveBeenCalled();
  });

  it('accepts decimal amounts with one decimal place (0.5)', async () => {
    stub.create.mockReturnValue(of(CURRENT_SET));
    fillValidForm(component, '0.5');
    component.submit();
    await fixture.whenStable();

    expect(component.submitError()).toBeNull();
    const payload = stub.create.mock.calls[0][0];
    expect(payload.fees[0].amount).toBe(0.5);
  });

  it('accepts float-imprecise 2-decimal amounts (8.29)', async () => {
    stub.create.mockReturnValue(of(CURRENT_SET));
    fillValidForm(component, '8.29');
    component.submit();
    await fixture.whenStable();

    expect(component.submitError()).toBeNull();
    const payload = stub.create.mock.calls[0][0];
    expect(payload.fees.every((f: { amount: number }) => f.amount === 8.29)).toBe(true);
  });

  it('rejects an amount with more than 2 decimal places', () => {
    fillValidForm(component, '12.345');
    component.submit();

    expect(component.submitError()).toBeTruthy();
    expect(stub.create).not.toHaveBeenCalled();
  });

  it('prevents submission when even one of the 8 cells is left empty (partial set)', () => {
    fillValidForm(component);
    const firstKey = Object.keys(component.form.controls.cells.controls)[0];
    component.form.controls.cells.controls[firstKey].setValue('');

    component.submit();

    expect(component.form.invalid).toBe(true);
    expect(component.submitError()).toBeTruthy();
    expect(stub.create).not.toHaveBeenCalled();
  });

  it('a 409 error response surfaces the server message verbatim as an inline error', async () => {
    const conflictErr = new HttpErrorResponse({
      status: 409,
      error: { statusCode: 409, message: 'New effectiveFrom 2026-01-01T00:00:00.000Z must be strictly after the latest existing effectiveFrom 2026-06-01T00:00:00.000Z.', error: 'Conflict' },
    });
    stub.create.mockReturnValue(throwError(() => conflictErr));

    fillValidForm(component);
    component.submit();
    await fixture.whenStable();

    expect(component.submitError()).toBe('New effectiveFrom 2026-01-01T00:00:00.000Z must be strictly after the latest existing effectiveFrom 2026-06-01T00:00:00.000Z.');
    expect(component.pending()).toBe(false);
  });

  it('a 400 error response surfaces the server message verbatim as an inline error', async () => {
    const badRequestErr = new HttpErrorResponse({
      status: 400,
      error: { statusCode: 400, message: 'Fee set is missing entries for: NA->ZA NAD.', error: 'Bad Request' },
    });
    stub.create.mockReturnValue(throwError(() => badRequestErr));

    fillValidForm(component);
    component.submit();
    await fixture.whenStable();

    expect(component.submitError()).toBe('Fee set is missing entries for: NA->ZA NAD.');
    expect(component.pending()).toBe(false);
  });

  it('a generic error surfaces a fallback message', async () => {
    stub.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

    fillValidForm(component);
    component.submit();
    await fixture.whenStable();

    expect(component.submitError()).toBe('Failed to schedule fee set. Please try again.');
    expect(component.pending()).toBe(false);
  });

  it('double-submit guard: while pending, a second submit is a no-op', () => {
    stub.create.mockReturnValueOnce(NEVER);

    fillValidForm(component);
    component.submit();
    expect(component.pending()).toBe(true);

    component.submit();
    expect(stub.create).toHaveBeenCalledTimes(1);
  });

  it('copyCurrentValues() fills all 8 cells from the in-force set', () => {
    component.copyCurrentValues();

    const values = Object.values(component.form.controls.cells.controls).map(c => c.value);
    expect(values.every(v => v === '75.50')).toBe(true);
  });
});

// ─── Load error test (isolated setup) ────────────────────────────────────────

describe('AdminShippingFee — load error path', () => {
  it('sets error signal and clears loading when list() fails', async () => {
    const failStub: ShippingFeeServiceStub = {
      list: vi.fn(() => throwError(() => new Error('500'))),
      create: vi.fn(),
      current: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminShippingFee],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ShippingFeeService, useValue: failStub },
      ],
    }).compileComponents();

    const failFixture = TestBed.createComponent(AdminShippingFee);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.loading()).toBe(false);
    expect(failComponent.error()).toBeTruthy();
  });
});
