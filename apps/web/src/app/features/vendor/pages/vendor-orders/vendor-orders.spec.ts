import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CountryCode, CurrencyCode, OrderDto, OrderStatus, VendorOrderLineDto } from '@hb/shared';

import { VendorOrders, vendorActionLabel, vendorActionsFor } from './vendor-orders';
import { OrdersService } from '../../../../core/api/orders.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const LINE_CONFIRMED: VendorOrderLineDto = {
  id: 'line-1',
  orderId: 'order-1',
  orderStatus: OrderStatus.CONFIRMED,
  orderCreatedAt: '2026-07-01T10:00:00.000Z',
  productName: 'Biltong 500g',
  unitPrice: 120.5,
  currency: CurrencyCode.ZAR,
  quantity: 2,
};

const LINE_PROCESSING: VendorOrderLineDto = {
  id: 'line-2',
  orderId: 'order-2',
  orderStatus: OrderStatus.PROCESSING,
  orderCreatedAt: '2026-07-02T10:00:00.000Z',
  productName: 'Rooibos Tea',
  unitPrice: 45,
  currency: CurrencyCode.NAD,
  quantity: 1,
};

const LINE_SHIPPED: VendorOrderLineDto = {
  id: 'line-3',
  orderId: 'order-3',
  orderStatus: OrderStatus.SHIPPED,
  orderCreatedAt: '2026-07-03T10:00:00.000Z',
  productName: 'Dried Mango',
  unitPrice: 30,
  currency: CurrencyCode.ZAR,
  quantity: 3,
};

const MOCK_LINES: VendorOrderLineDto[] = [LINE_CONFIRMED, LINE_PROCESSING, LINE_SHIPPED];

function updatedOrder(status: OrderStatus): OrderDto {
  return {
    id: 'order-1',
    status,
    currency: CurrencyCode.ZAR,
    subtotal: 241,
    shippingTotal: 0,
    total: 241,
    originCountry: CountryCode.SOUTH_AFRICA,
    destinationCountry: CountryCode.SOUTH_AFRICA,
    items: [],
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  };
}

// ─── Stub ────────────────────────────────────────────────────────────────────

interface OrdersStub {
  listForVendor: ReturnType<typeof vi.fn>;
  updateStatus: ReturnType<typeof vi.fn>;
}

function makeStub(lines: VendorOrderLineDto[] = MOCK_LINES): OrdersStub {
  return {
    listForVendor: vi.fn(() => of(lines)),
    updateStatus: vi.fn(() => of(updatedOrder(OrderStatus.PROCESSING))),
  };
}

async function setupTestBed(stub: OrdersStub): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [VendorOrders],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: OrdersService, useValue: stub },
    ],
  }).compileComponents();
}

// ─── Pure helper unit tests ───────────────────────────────────────────────────

describe('vendorActionsFor', () => {
  it('returns [PROCESSING] for confirmed', () => {
    expect(vendorActionsFor(OrderStatus.CONFIRMED)).toEqual([OrderStatus.PROCESSING]);
  });

  it('returns [HANDED_TO_HB] for processing', () => {
    expect(vendorActionsFor(OrderStatus.PROCESSING)).toEqual([OrderStatus.HANDED_TO_HB]);
  });

  it('returns [] for pending', () => {
    expect(vendorActionsFor(OrderStatus.PENDING)).toEqual([]);
  });

  it('returns [] for handed_to_hb', () => {
    expect(vendorActionsFor(OrderStatus.HANDED_TO_HB)).toEqual([]);
  });

  it('returns [] for shipped', () => {
    expect(vendorActionsFor(OrderStatus.SHIPPED)).toEqual([]);
  });

  it('returns [] for delivered', () => {
    expect(vendorActionsFor(OrderStatus.DELIVERED)).toEqual([]);
  });

  it('returns [] for cancelled', () => {
    expect(vendorActionsFor(OrderStatus.CANCELLED)).toEqual([]);
  });
});

describe('vendorActionLabel', () => {
  it('labels PROCESSING as "Mark as Processing"', () => {
    expect(vendorActionLabel(OrderStatus.PROCESSING)).toBe('Mark as Processing');
  });

  it('labels HANDED_TO_HB as "Mark as Handed to HB"', () => {
    expect(vendorActionLabel(OrderStatus.HANDED_TO_HB)).toBe('Mark as Handed to HB');
  });
});

// ─── Main suite (with real data) ─────────────────────────────────────────────

describe('VendorOrders component', () => {
  let component: VendorOrders;
  let fixture: ComponentFixture<VendorOrders>;
  let stub: OrdersStub;

  beforeEach(async () => {
    stub = makeStub();
    await setupTestBed(stub);
    fixture = TestBed.createComponent(VendorOrders);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('calls listForVendor on init', () => {
    expect(stub.listForVendor).toHaveBeenCalledTimes(1);
  });

  it('sets lines signal from the API response', () => {
    expect(component.lines()).toEqual(MOCK_LINES);
  });

  it('clears loading after successful fetch', () => {
    expect(component.loading()).toBe(false);
  });

  it('error signal is null on success', () => {
    expect(component.error()).toBeNull();
  });

  it('renders a row per order line', () => {
    const rows = fixture.nativeElement.querySelectorAll('.order-row');
    expect(rows.length).toBe(3);
  });

  it('renders an action button for the confirmed line', () => {
    const rows = fixture.nativeElement.querySelectorAll('.order-row');
    const buttons = rows[0].querySelectorAll('.action-btn');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('Mark as Processing');
  });

  it('renders no action button for the shipped line', () => {
    const rows = fixture.nativeElement.querySelectorAll('.order-row');
    const buttons = rows[2].querySelectorAll('.action-btn');
    expect(buttons.length).toBe(0);
  });

  it('does not render a size label when sizeLabel is absent on a line', () => {
    const rows = fixture.nativeElement.querySelectorAll('.order-row');
    expect(rows[0].textContent).not.toContain('Size');
  });

  it('clicking an action button calls updateStatus and updates the line in place', async () => {
    component.applyAction(LINE_CONFIRMED, OrderStatus.PROCESSING);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(stub.updateStatus).toHaveBeenCalledWith('order-1', OrderStatus.PROCESSING);
    const updated = component.lines().find((l) => l.id === 'line-1');
    expect(updated?.orderStatus).toBe(OrderStatus.PROCESSING);
  });

  it('clears pendingId after a successful update', async () => {
    component.applyAction(LINE_CONFIRMED, OrderStatus.PROCESSING);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.pendingId()).toBeNull();
  });

  it('double-submit guard prevents a second call while pending', () => {
    // First call never completes, so pendingId stays set.
    stub.updateStatus.mockReturnValueOnce(NEVER);
    component.applyAction(LINE_CONFIRMED, OrderStatus.PROCESSING);
    expect(component.pendingId()).toBe('line-1');

    // Second call must be ignored — no extra updateStatus invocation.
    component.applyAction(LINE_PROCESSING, OrderStatus.HANDED_TO_HB);
    expect(stub.updateStatus).toHaveBeenCalledTimes(1);
    expect(component.pendingId()).toBe('line-1');
  });
});

// ─── Size label suite ─────────────────────────────────────────────────────────

describe('VendorOrders — size label', () => {
  it('renders the size label when present on a line', async () => {
    const lineWithSize: VendorOrderLineDto = { ...LINE_CONFIRMED, sizeLabel: 'L' };
    await setupTestBed(makeStub([lineWithSize]));
    const fixture = TestBed.createComponent(VendorOrders);
    fixture.detectChanges();
    await fixture.whenStable();

    const rows = fixture.nativeElement.querySelectorAll('.order-row');
    expect(rows[0].textContent).toContain('Size L');
  });
});

// ─── Empty-state suite ────────────────────────────────────────────────────────

describe('VendorOrders — empty state', () => {
  let component: VendorOrders;
  let fixture: ComponentFixture<VendorOrders>;

  beforeEach(async () => {
    await setupTestBed(makeStub([]));
    fixture = TestBed.createComponent(VendorOrders);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('shows the empty state without setting an error', () => {
    expect(component.lines()).toEqual([]);
    expect(component.error()).toBeNull();
    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState.textContent).toContain('No orders yet');
  });
});

// ─── Error path (load) ────────────────────────────────────────────────────────

describe('VendorOrders — load API error', () => {
  let component: VendorOrders;
  let fixture: ComponentFixture<VendorOrders>;

  beforeEach(async () => {
    const failStub: OrdersStub = {
      listForVendor: vi.fn(() => throwError(() => new Error('500'))),
      updateStatus: vi.fn(),
    };
    await setupTestBed(failStub);
    fixture = TestBed.createComponent(VendorOrders);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('sets error signal when listForVendor fails', () => {
    expect(component.error()).toBeTruthy();
  });

  it('clears loading after failure', () => {
    expect(component.loading()).toBe(false);
  });

  it('lines signal remains empty after failure', () => {
    expect(component.lines()).toEqual([]);
  });
});

// ─── Error path (status update) ───────────────────────────────────────────────

describe('VendorOrders — status update failure', () => {
  let component: VendorOrders;
  let fixture: ComponentFixture<VendorOrders>;
  let stub: OrdersStub;

  beforeEach(async () => {
    stub = {
      listForVendor: vi.fn(() => of(MOCK_LINES)),
      updateStatus: vi.fn(() => throwError(() => new Error('500'))),
    };
    await setupTestBed(stub);
    fixture = TestBed.createComponent(VendorOrders);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('sets actionError without losing the rest of the list', async () => {
    component.applyAction(LINE_CONFIRMED, OrderStatus.PROCESSING);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.actionError()).toBeTruthy();
    expect(component.lines()).toEqual(MOCK_LINES);
    expect(component.pendingId()).toBeNull();
  });
});
