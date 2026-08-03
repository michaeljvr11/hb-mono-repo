import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError, NEVER } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommissionRateListDto, CommissionRateListItemDto } from '@hb/shared';

import { AdminCommission } from './admin-commission';
import { CommissionService } from '../../../../core/api/commission.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_ITEMS: CommissionRateListItemDto[] = [
  {
    id: 'c2',
    ratePercent: 15,
    effectiveFrom: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-05-20T00:00:00.000Z',
    inForce: true,
  },
  {
    id: 'c1',
    ratePercent: 12.5,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    note: 'Initial rate',
    createdAt: '2025-12-15T00:00:00.000Z',
    inForce: false,
  },
];

const MOCK_LIST: CommissionRateListDto = { items: MOCK_ITEMS };

// ─── Stub shape ──────────────────────────────────────────────────────────────

interface CommissionServiceStub {
  list: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}

// ─── Component integration tests ─────────────────────────────────────────────

describe('AdminCommission component', () => {
  let component: AdminCommission;
  let fixture: ComponentFixture<AdminCommission>;
  let stub: CommissionServiceStub;

  beforeEach(async () => {
    stub = {
      list: vi.fn(() => of({ items: [...MOCK_ITEMS] })),
      create: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminCommission],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CommissionService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminCommission);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads and renders current rate + history on init', () => {
    expect(stub.list).toHaveBeenCalledTimes(1);
    expect(component.loading()).toBe(false);
    expect(component.items().length).toBe(2);
    expect(component.currentRate()?.id).toBe('c2');
    expect(component.currentRate()?.ratePercent).toBe(15);
  });

  it('submitting a valid new rate calls create() with the right payload and refreshes the list', async () => {
    const created: CommissionRateListItemDto = {
      id: 'c3',
      ratePercent: 18,
      effectiveFrom: '2026-07-01T00:00:00.000Z',
      note: 'Q3 update',
      createdAt: '2026-06-25T00:00:00.000Z',
      inForce: false,
    };
    stub.create.mockReturnValue(of(created));
    stub.list.mockReturnValue(of({ items: [created, ...MOCK_ITEMS] }));

    component.ratePercent.set(18);
    component.note.set('Q3 update');
    component.submit();
    await fixture.whenStable();

    expect(stub.create).toHaveBeenCalledWith({ ratePercent: 18, note: 'Q3 update' });
    expect(stub.list).toHaveBeenCalledTimes(2);
    expect(component.pending()).toBe(false);
    expect(component.ratePercent()).toBeNull();
    expect(component.note()).toBe('');
  });

  it('a 409 error response surfaces an inline conflict message and does not crash', async () => {
    const conflictErr = new HttpErrorResponse({
      status: 409,
      error: { statusCode: 409, message: 'A rate already exists on or after that date.', error: 'Conflict' },
    });
    stub.create.mockReturnValue(throwError(() => conflictErr));

    component.ratePercent.set(20);
    component.submit();
    await fixture.whenStable();

    expect(component.formError()).toBe('A rate already exists on or after that date.');
    expect(component.pending()).toBe(false);
  });

  it('a generic error surfaces a fallback message', async () => {
    stub.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

    component.ratePercent.set(20);
    component.submit();
    await fixture.whenStable();

    expect(component.formError()).toBe('Failed to schedule rate. Please try again.');
    expect(component.pending()).toBe(false);
  });

  it('client-side validation rejects a ratePercent outside 0-100', () => {
    component.ratePercent.set(150);
    component.submit();

    expect(component.validationError()).toBeTruthy();
    expect(stub.create).not.toHaveBeenCalled();
  });

  it('client-side validation rejects a null ratePercent', () => {
    component.ratePercent.set(null);
    component.submit();

    expect(component.validationError()).toBeTruthy();
    expect(stub.create).not.toHaveBeenCalled();
  });

  it('double-submit guard: while pending, a second submit is a no-op', () => {
    stub.create.mockReturnValueOnce(NEVER);

    component.ratePercent.set(20);
    component.submit();
    expect(component.pending()).toBe(true);

    component.ratePercent.set(25);
    component.submit();
    expect(stub.create).toHaveBeenCalledTimes(1);
  });
});

// ─── Load error test (isolated setup) ────────────────────────────────────────

describe('AdminCommission — load error path', () => {
  it('sets error signal and clears loading when list() fails', async () => {
    const failStub: CommissionServiceStub = {
      list: vi.fn(() => throwError(() => new Error('500'))),
      create: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminCommission],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CommissionService, useValue: failStub },
      ],
    }).compileComponents();

    const failFixture = TestBed.createComponent(AdminCommission);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.loading()).toBe(false);
    expect(failComponent.error()).toBeTruthy();
  });
});
