import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AdminOrderListDto,
  AdminOrderListItemDto,
  CountryCode,
  CurrencyCode,
  OrderDto,
  OrderStatus,
  OrderStatusOverrideAuditDto,
} from '@hb/shared';

import { AdminOrders } from './admin-orders';
import { AdminOrdersService } from '../../../../core/api/admin-orders.service';
import { OrdersService } from '../../../../core/api/orders.service';

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

function makeOrderDto(overrides: Partial<OrderDto> = {}): OrderDto {
  return {
    id: ORDER_1.id,
    status: OrderStatus.CONFIRMED,
    currency: CurrencyCode.ZAR,
    subtotal: 1200.00,
    shippingTotal: 50.00,
    total: 1250.00,
    originCountry: CountryCode.SOUTH_AFRICA,
    destinationCountry: CountryCode.NAMIBIA,
    items: [],
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-02T10:00:00.000Z',
    ...overrides,
  };
}

function makeAuditRow(overrides: Partial<OrderStatusOverrideAuditDto> = {}): OrderStatusOverrideAuditDto {
  return {
    id: 'audit-001',
    orderId: ORDER_1.id,
    adminUserId: 'admin-001',
    adminEmail: undefined,
    fromStatus: OrderStatus.PENDING,
    toStatus: OrderStatus.CONFIRMED,
    reason: 'Payment confirmed manually over the phone.',
    sendNotifications: false,
    createdAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  };
}

// ─── Service stubs ───────────────────────────────────────────────────────────

interface AdminOrdersServiceStub {
  getDashboard: ReturnType<typeof vi.fn>;
  listOrders: ReturnType<typeof vi.fn>;
}

interface OrdersServiceStub {
  overrideStatus: ReturnType<typeof vi.fn>;
  getStatusOverrides: ReturnType<typeof vi.fn>;
}

function makeOrdersServiceStub(overrides: Partial<OrdersServiceStub> = {}): OrdersServiceStub {
  return {
    overrideStatus: vi.fn(() => of(makeOrderDto())),
    getStatusOverrides: vi.fn(() => of([])),
    ...overrides,
  };
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function createComponent(
  stub: AdminOrdersServiceStub,
  ordersStub: OrdersServiceStub = makeOrdersServiceStub(),
): Promise<{
  component: AdminOrders;
  fixture: ComponentFixture<AdminOrders>;
  nativeEl: HTMLElement;
  ordersStub: OrdersServiceStub;
}> {
  await TestBed.configureTestingModule({
    imports: [AdminOrders],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AdminOrdersService, useValue: stub },
      { provide: OrdersService, useValue: ordersStub },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AdminOrders);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();

  return { component, fixture, nativeEl: fixture.nativeElement as HTMLElement, ordersStub };
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

  it('humanizeStatus title-cases each underscore-separated word (e.g. handed_to_hb)', () => {
    expect(component.humanizeStatus('handed_to_hb')).toBe('Handed To Hb');
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

// ─── Status override + audit history ──────────────────────────────────────────

function statusSelectEvent(status: OrderStatus): Event {
  return { target: { value: status } } as unknown as Event;
}

function reasonInputEvent(value: string): Event {
  return { target: { value } } as unknown as Event;
}

function checkboxEvent(checked: boolean): Event {
  return { target: { checked } } as unknown as Event;
}

describe('AdminOrders — status override & audit history', () => {
  let component: AdminOrders;
  let fixture: ComponentFixture<AdminOrders>;
  let nativeEl: HTMLElement;
  let adminOrdersStub: AdminOrdersServiceStub;
  let ordersStub: OrdersServiceStub;

  beforeEach(async () => {
    adminOrdersStub = {
      getDashboard: vi.fn(),
      listOrders: vi.fn(() => of(makeResult())),
    };
    ordersStub = makeOrdersServiceStub({
      getStatusOverrides: vi.fn(() => of([makeAuditRow()])),
    });

    ({ component, fixture, nativeEl } = await createComponent(adminOrdersStub, ordersStub));

    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('fetches audit history when an order is selected', () => {
    expect(ordersStub.getStatusOverrides).toHaveBeenCalledWith(ORDER_1.id);
  });

  it('renders audit rows with from/to/reason/notifications/who/when', () => {
    const item = nativeEl.querySelector('.audit-item');
    expect(item).not.toBeNull();
    expect(item!.textContent).toContain('Pending');
    expect(item!.textContent).toContain('Confirmed');
    expect(item!.textContent).toContain('Payment confirmed manually over the phone.');
    expect(item!.textContent).toContain('admin-001'); // falls back to id, adminEmail is undefined
    expect(item!.textContent).toContain('No notification sent');
  });

  it('shows "Notified customer" when sendNotifications was true on the audit row', async () => {
    ordersStub.getStatusOverrides.mockReturnValue(of([makeAuditRow({ sendNotifications: true })]));
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();

    const item = nativeEl.querySelector('.audit-item');
    expect(item!.textContent).toContain('Notified customer');
  });

  it('shows an empty-history message when there are no audit rows', async () => {
    ordersStub.getStatusOverrides.mockReturnValue(of([]));
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(nativeEl.querySelector('.audit-item')).toBeNull();
    expect(nativeEl.textContent).toContain('No overrides recorded for this order.');
  });

  it('surfaces an audit error banner when getStatusOverrides() fails', async () => {
    ordersStub.getStatusOverrides.mockReturnValue(throwError(() => new Error('500')));
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.auditError()).toBeTruthy();
  });

  // ─── Client-side reason validation ──────────────────────────────────────

  it('blocks the confirm step and sets an error when reason is empty', () => {
    component.requestOverrideConfirm();

    expect(component.overrideReasonError()).toBeTruthy();
    expect(component.showOverrideConfirm()).toBe(false);
    expect(ordersStub.overrideStatus).not.toHaveBeenCalled();
  });

  it('blocks the confirm step when reason is only whitespace', () => {
    component.onReasonInput(reasonInputEvent('   '));
    component.requestOverrideConfirm();

    expect(component.overrideReasonError()).toBeTruthy();
    expect(component.showOverrideConfirm()).toBe(false);
  });

  it('clears the reason error once a non-empty reason is typed', () => {
    component.requestOverrideConfirm();
    expect(component.overrideReasonError()).toBeTruthy();

    component.onReasonInput(reasonInputEvent('Customer called support.'));
    expect(component.overrideReasonError()).toBeNull();
  });

  // ─── Confirmation gating ─────────────────────────────────────────────────

  it('does not call overrideStatus() until the confirm step is completed', () => {
    component.onReasonInput(reasonInputEvent('Customer called support.'));
    component.requestOverrideConfirm();

    expect(component.showOverrideConfirm()).toBe(true);
    expect(ordersStub.overrideStatus).not.toHaveBeenCalled();
  });

  it('cancelling the confirm step does not call overrideStatus()', () => {
    component.onReasonInput(reasonInputEvent('Customer called support.'));
    component.requestOverrideConfirm();
    component.cancelOverrideConfirm();

    expect(component.showOverrideConfirm()).toBe(false);
    expect(ordersStub.overrideStatus).not.toHaveBeenCalled();
  });

  // ─── Submitting the override ─────────────────────────────────────────────

  it('calls overrideStatus() with sendNotifications: false when the checkbox is left unchecked', () => {
    component.onOverrideStatusChange(statusSelectEvent(OrderStatus.CANCELLED));
    component.onReasonInput(reasonInputEvent('Customer requested cancellation by phone.'));
    component.requestOverrideConfirm();
    component.confirmOverride(ORDER_1.id);

    expect(ordersStub.overrideStatus).toHaveBeenCalledWith(ORDER_1.id, {
      status: OrderStatus.CANCELLED,
      reason: 'Customer requested cancellation by phone.',
      sendNotifications: false,
    });
  });

  it('calls overrideStatus() with sendNotifications: true when the checkbox is checked', () => {
    component.onOverrideStatusChange(statusSelectEvent(OrderStatus.SHIPPED));
    component.onReasonInput(reasonInputEvent('Manual correction after courier confirmation.'));
    component.onSendNotificationsChange(checkboxEvent(true));
    component.requestOverrideConfirm();
    component.confirmOverride(ORDER_1.id);

    expect(ordersStub.overrideStatus).toHaveBeenCalledWith(ORDER_1.id, {
      status: OrderStatus.SHIPPED,
      reason: 'Manual correction after courier confirmation.',
      sendNotifications: true,
    });
  });

  it('on success: updates the order status + updatedAt in the list and refreshes audit history', async () => {
    ordersStub.overrideStatus.mockReturnValue(
      of(makeOrderDto({ status: OrderStatus.CANCELLED, updatedAt: '2026-08-17T12:00:00.000Z' })),
    );
    ordersStub.getStatusOverrides.mockClear();

    component.onOverrideStatusChange(statusSelectEvent(OrderStatus.CANCELLED));
    component.onReasonInput(reasonInputEvent('Customer requested cancellation by phone.'));
    component.requestOverrideConfirm();
    component.confirmOverride(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();

    const patched = component.result().items.find(o => o.id === ORDER_1.id);
    expect(patched?.status).toBe(OrderStatus.CANCELLED);
    expect(patched?.updatedAt).toBe('2026-08-17T12:00:00.000Z');
    expect(component.showOverrideConfirm()).toBe(false);
    expect(component.overrideReason()).toBe('');
    expect(ordersStub.getStatusOverrides).toHaveBeenCalledWith(ORDER_1.id);
  });

  it('on server error: surfaces overrideError and clears the pending guard', async () => {
    ordersStub.overrideStatus.mockReturnValue(throwError(() => new Error('500')));

    component.onReasonInput(reasonInputEvent('Customer requested cancellation by phone.'));
    component.requestOverrideConfirm();
    component.confirmOverride(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.overrideError()).toBeTruthy();
    expect(component.overridePendingId()).toBeNull();
  });

  it('guards against double-submit while an override is in flight', () => {
    const inFlight = new Subject<OrderDto>();
    ordersStub.overrideStatus.mockReturnValue(inFlight.asObservable());

    component.onReasonInput(reasonInputEvent('Customer requested cancellation by phone.'));
    component.requestOverrideConfirm();

    component.confirmOverride(ORDER_1.id); // starts the request
    component.confirmOverride(ORDER_1.id); // should be ignored — one is already pending

    expect(ordersStub.overrideStatus).toHaveBeenCalledTimes(1);

    inFlight.next(makeOrderDto());
    inFlight.complete();

    expect(component.overridePendingId()).toBeNull();
  });
});

// ─── Stale-response race guard ─────────────────────────────────────────────────
//
// Regression coverage for a review finding: switching the selected order mid-flight
// must not let a slow response for the OLD order clobber the panel now showing the
// NEW order (audit history, form state, or the pending-override lock).

describe('AdminOrders — stale response race guard', () => {
  it('a stale audit-history response for order A does not overwrite order B\'s audit list', async () => {
    const auditForA = new Subject<OrderStatusOverrideAuditDto[]>();
    const auditRowsForB = [makeAuditRow({ id: 'audit-b', orderId: ORDER_2.id, reason: 'B reason' })];

    const adminOrdersStub: AdminOrdersServiceStub = {
      getDashboard: vi.fn(),
      listOrders: vi.fn(() => of(makeResult())),
    };
    const ordersStub = makeOrdersServiceStub({
      getStatusOverrides: vi.fn((id: string) =>
        id === ORDER_1.id ? auditForA.asObservable() : of(auditRowsForB),
      ),
    });

    const { component, fixture } = await createComponent(adminOrdersStub, ordersStub);

    // Select order A — its audit fetch is left hanging (auditForA hasn't emitted yet).
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.auditHistory()).toEqual([]);

    // Navigate to order B before A's response arrives — B's own fetch resolves immediately.
    component.selectOrder(ORDER_2.id);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.auditHistory()).toEqual(auditRowsForB);

    // A's slow response finally arrives.
    auditForA.next([makeAuditRow({ id: 'audit-a', orderId: ORDER_1.id })]);
    auditForA.complete();
    fixture.detectChanges();
    await fixture.whenStable();

    // Must still show B's audit history — A's stale response was a no-op.
    expect(component.selectedId()).toBe(ORDER_2.id);
    expect(component.auditHistory()).toEqual(auditRowsForB);
  });

  it('a stale confirmOverride() success response for order A does not touch order B\'s panel state', async () => {
    const overrideForA = new Subject<OrderDto>();

    const adminOrdersStub: AdminOrdersServiceStub = {
      getDashboard: vi.fn(),
      listOrders: vi.fn(() => of(makeResult())),
    };
    const ordersStub = makeOrdersServiceStub({
      overrideStatus: vi.fn(() => overrideForA.asObservable()),
      getStatusOverrides: vi.fn(() => of([])),
    });

    const { component, fixture } = await createComponent(adminOrdersStub, ordersStub);

    // Select order A and fire (but don't resolve) an override.
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();

    component.onReasonInput(reasonInputEvent('Customer requested cancellation by phone.'));
    component.requestOverrideConfirm();
    component.confirmOverride(ORDER_1.id);
    expect(component.overridePendingId()).toBe(ORDER_1.id);

    // Navigate away to order B before A's response arrives.
    component.selectOrder(ORDER_2.id);
    fixture.detectChanges();
    await fixture.whenStable();

    // B's panel starts from a clean slate (clearOverrideState() ran on selection).
    expect(component.overrideReason()).toBe('');
    expect(component.showOverrideConfirm()).toBe(false);
    expect(component.auditHistory()).toEqual([]);

    // A's response now arrives — must be a no-op against the panel now showing B.
    overrideForA.next(makeOrderDto({ id: ORDER_1.id, status: OrderStatus.CANCELLED }));
    overrideForA.complete();
    fixture.detectChanges();
    await fixture.whenStable();

    // B's panel state is untouched by A's stale response, and A's list entry was
    // NOT patched either (the whole handler no-ops once the selection has moved on).
    expect(component.selectedId()).toBe(ORDER_2.id);
    expect(component.overrideReason()).toBe('');
    expect(component.showOverrideConfirm()).toBe(false);
    expect(component.auditHistory()).toEqual([]);
    expect(component.result().items.find(o => o.id === ORDER_1.id)?.status).toBe(OrderStatus.PENDING);

    // The lock is still released by A's own (now-stale) completion — only the
    // panel/audit refresh is skipped — so the Confirm control isn't left
    // permanently disabled just because the admin navigated away mid-flight.
    expect(component.overridePendingId()).toBeNull();
  });
});
