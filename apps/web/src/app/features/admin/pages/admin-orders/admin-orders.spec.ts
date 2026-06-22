import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AdminOrderListDto,
  AdminOrderListItemDto,
  CountryCode,
  CurrencyCode,
  OrderStatus,
} from '@hb/shared';

import { AdminOrders } from './admin-orders';
import { AdminOrdersService } from '../../../../core/api/admin-orders.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<AdminOrderListItemDto> = {}): AdminOrderListItemDto {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    status: OrderStatus.PENDING,
    currency: CurrencyCode.ZAR,
    total: 1250.00,
    customerId: 'cust-001',
    customerEmail: 'buyer@example.com',
    customerName: 'Test Buyer',
    vendorIds: ['v-001', 'v-002'],
    itemCount: 3,
    originCountry: CountryCode.SOUTH_AFRICA,
    destinationCountry: CountryCode.NAMIBIA,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T11:00:00.000Z',
    ...overrides,
  };
}

const ORDER_1 = makeOrder({ id: 'aaaaaaaa-0000-0000-0000-000000000001' });
const ORDER_2 = makeOrder({
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  status: OrderStatus.SHIPPED,
  customerName: undefined,
  customerEmail: 'shipped@example.com',
  vendorIds: [],
  total: 500.00,
});

function makeResult(overrides: Partial<AdminOrderListDto> = {}): AdminOrderListDto {
  return {
    items: [ORDER_1, ORDER_2],
    total: 2,
    page: 1,
    limit: 20,
    pageCount: 1,
    ...overrides,
  };
}

const EMPTY_RESULT: AdminOrderListDto = {
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  pageCount: 1,
};

// ─── Service stub ────────────────────────────────────────────────────────────

interface AdminOrdersServiceStub {
  getDashboard: ReturnType<typeof vi.fn>;
  listOrders: ReturnType<typeof vi.fn>;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function createComponent(stub: AdminOrdersServiceStub): Promise<{
  component: AdminOrders;
  fixture: ComponentFixture<AdminOrders>;
  nativeEl: HTMLElement;
}> {
  await TestBed.configureTestingModule({
    imports: [AdminOrders],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AdminOrdersService, useValue: stub },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AdminOrders);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();

  return { component, fixture, nativeEl: fixture.nativeElement as HTMLElement };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AdminOrders component', () => {
  let component: AdminOrders;
  let fixture: ComponentFixture<AdminOrders>;
  let nativeEl: HTMLElement;
  let stub: AdminOrdersServiceStub;

  beforeEach(async () => {
    stub = {
      getDashboard: vi.fn(),
      listOrders: vi.fn(() => of(makeResult())),
    };

    ({ component, fixture, nativeEl } = await createComponent(stub));
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('calls listOrders on init with page 1 and clears loading', () => {
    expect(stub.listOrders).toHaveBeenCalledTimes(1);
    expect(stub.listOrders).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('renders order rows when items are present', () => {
    const rows = nativeEl.querySelectorAll('.order-row');
    expect(rows.length).toBe(2);
  });

  it('shows customer name in the row when present (ORDER_1)', () => {
    const rows = nativeEl.querySelectorAll('.order-row');
    expect(rows[0].textContent).toContain('Test Buyer');
  });

  it('falls back to customerEmail when customerName is absent (ORDER_2)', () => {
    const rows = nativeEl.querySelectorAll('.order-row');
    expect(rows[1].textContent).toContain('shipped@example.com');
  });

  it('shows a short id prefix in each row', () => {
    const rows = nativeEl.querySelectorAll('.order-row');
    expect(rows[0].textContent).toContain('#aaaaaaaa');
    expect(rows[1].textContent).toContain('#bbbbbbbb');
  });

  it('shows status badge for each order', () => {
    const badges = nativeEl.querySelectorAll('.status-badge');
    const texts = Array.from(badges).map(b => b.textContent?.trim() ?? '');
    expect(texts.some(t => t === 'Pending')).toBe(true);
    expect(texts.some(t => t === 'Shipped')).toBe(true);
  });

  it('statusFilter defaults to "all"', () => {
    expect(component.statusFilter()).toBe('all');
  });

  it('setStatusFilter triggers a re-query with the correct status param', () => {
    stub.listOrders.mockClear();
    stub.listOrders.mockReturnValue(of(makeResult()));

    component.setStatusFilter(OrderStatus.SHIPPED);

    expect(stub.listOrders).toHaveBeenCalledTimes(1);
    expect(stub.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ status: OrderStatus.SHIPPED, page: 1 }),
    );
  });

  it('setStatusFilter("all") queries without a status param', () => {
    stub.listOrders.mockClear();
    stub.listOrders.mockReturnValue(of(makeResult()));

    component.setStatusFilter('all');

    const callArg = stub.listOrders.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg['status']).toBeUndefined();
  });

  it('setStatusFilter resets page to 1 and clears selectedId', () => {
    component.selectOrder(ORDER_1.id);
    expect(component.selectedId()).toBe(ORDER_1.id);

    stub.listOrders.mockReturnValue(of(makeResult()));
    component.setStatusFilter(OrderStatus.CONFIRMED);

    expect(component.page()).toBe(1);
    expect(component.selectedId()).toBeNull();
  });

  it('applyVendorFilter triggers a re-query with vendorId when non-empty', () => {
    stub.listOrders.mockClear();
    stub.listOrders.mockReturnValue(of(makeResult()));

    const event = { target: { value: 'v-001' } } as unknown as Event;
    component.applyVendorFilter(event);

    expect(stub.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ vendorId: 'v-001', page: 1 }),
    );
  });

  it('applyVendorFilter with empty string queries without vendorId param', () => {
    stub.listOrders.mockClear();
    stub.listOrders.mockReturnValue(of(makeResult()));

    const event = { target: { value: '  ' } } as unknown as Event;
    component.applyVendorFilter(event);

    const callArg = stub.listOrders.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg['vendorId']).toBeUndefined();
  });

  it('selectOrder sets selectedId and populates selectedOrder', () => {
    component.selectOrder(ORDER_1.id);
    expect(component.selectedId()).toBe(ORDER_1.id);
    expect(component.selectedOrder()?.id).toBe(ORDER_1.id);
    expect(component.selectedOrder()?.customerEmail).toBe('buyer@example.com');
  });

  it('detail panel shows order fields after selection', async () => {
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();

    const card = nativeEl.querySelector('.detail-card');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('#aaaaaaaa');
    expect(card!.textContent).toContain('Test Buyer');
  });

  it('shows detail-empty when no order is selected', () => {
    const detailEmpty = nativeEl.querySelector('.detail-empty');
    expect(detailEmpty).not.toBeNull();
  });

  // ─── Pagination ──────────────────────────────────────────────────────────

  it('isPrevDisabled is true on page 1', () => {
    expect(component.page()).toBe(1);
    expect(component.isPrevDisabled()).toBe(true);
  });

  it('isNextDisabled is true when pageCount === 1', () => {
    expect(component.result().pageCount).toBe(1);
    expect(component.isNextDisabled()).toBe(true);
  });

  it('goToNext increments page and re-queries', () => {
    // Override result to have pageCount=3
    stub.listOrders.mockReturnValue(of(makeResult({ page: 1, pageCount: 3, total: 60 })));
    component.setStatusFilter('all'); // reload with new stub
    fixture.detectChanges();

    stub.listOrders.mockClear();
    stub.listOrders.mockReturnValue(of(makeResult({ page: 2, pageCount: 3 })));

    component.goToNext();

    expect(stub.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
    );
  });

  it('goToPrev decrements page and re-queries when not on page 1', () => {
    // Move to page 2 first
    stub.listOrders.mockReturnValue(of(makeResult({ page: 2, pageCount: 3 })));
    component['page'].set(2);
    fixture.detectChanges();

    stub.listOrders.mockClear();
    stub.listOrders.mockReturnValue(of(makeResult({ page: 1, pageCount: 3 })));

    component.goToPrev();

    expect(stub.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });

  it('goToPrev is a no-op on page 1 (isPrevDisabled)', () => {
    expect(component.page()).toBe(1);
    stub.listOrders.mockClear();

    component.goToPrev();

    expect(stub.listOrders).not.toHaveBeenCalled();
  });

  it('goToNext is a no-op on the last page (isNextDisabled)', () => {
    expect(component.isNextDisabled()).toBe(true);
    stub.listOrders.mockClear();

    component.goToNext();

    expect(stub.listOrders).not.toHaveBeenCalled();
  });

  // ─── Utility methods ─────────────────────────────────────────────────────

  it('shortId returns the first 8 chars of a UUID', () => {
    expect(component.shortId('aaaaaaaa-0000-0000-0000-000000000001')).toBe('aaaaaaaa');
  });

  it('humanizeStatus capitalises the first letter', () => {
    expect(component.humanizeStatus('pending')).toBe('Pending');
    expect(component.humanizeStatus('shipped')).toBe('Shipped');
  });

  it('customerDisplay returns name when present', () => {
    expect(component.customerDisplay(ORDER_1)).toBe('Test Buyer');
  });

  it('customerDisplay falls back to email when name is absent', () => {
    expect(component.customerDisplay(ORDER_2)).toBe('shipped@example.com');
  });

  it('formatMoney formats ZAR correctly', () => {
    expect(component.formatMoney(1250, CurrencyCode.ZAR)).toBe('R 1250.00 ZAR');
  });

  it('formatMoney formats NAD correctly', () => {
    expect(component.formatMoney(500.5, CurrencyCode.NAD)).toBe('N$ 500.50 NAD');
  });
});

// ─── Empty state ─────────────────────────────────────────────────────────────

describe('AdminOrders — empty state', () => {
  it('shows "No orders yet" message when items is empty', async () => {
    const stub: AdminOrdersServiceStub = {
      getDashboard: vi.fn(),
      listOrders: vi.fn(() => of(EMPTY_RESULT)),
    };

    const { nativeEl } = await createComponent(stub);

    const emptyEl = nativeEl.querySelector('.list-empty');
    expect(emptyEl).not.toBeNull();
    expect(emptyEl!.textContent).toContain('No orders yet');
  });

  it('does not show an error banner for an empty result', async () => {
    const stub: AdminOrdersServiceStub = {
      getDashboard: vi.fn(),
      listOrders: vi.fn(() => of(EMPTY_RESULT)),
    };

    const { nativeEl } = await createComponent(stub);

    const errorBanner = nativeEl.querySelector('.error-banner');
    expect(errorBanner).toBeNull();
  });
});

// ─── Error loading path ───────────────────────────────────────────────────────

describe('AdminOrders — load error path', () => {
  it('sets error signal and clears loading when listOrders() fails', async () => {
    const stub: AdminOrdersServiceStub = {
      getDashboard: vi.fn(),
      listOrders: vi.fn(() => throwError(() => new Error('500'))),
    };

    const { component } = await createComponent(stub);

    expect(component.loading()).toBe(false);
    expect(component.error()).toBeTruthy();
  });
});
