import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CountryCode,
  CurrencyCode,
  ListingType,
  OrderDto,
  OrderStatus,
} from '@hb/shared';

import { ProfileOrders } from './profile-orders';
import { OrdersService } from '../../../../core/api/orders.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<OrderDto> = {}): OrderDto {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    status: OrderStatus.PENDING,
    currency: CurrencyCode.ZAR,
    subtotal: 1200,
    shippingTotal: 50,
    total: 1250,
    originCountry: CountryCode.SOUTH_AFRICA,
    destinationCountry: CountryCode.NAMIBIA,
    shippingAddress: {
      id: 'addr-1',
      recipientName: 'Jane Doe',
      line1: '123 Main St',
      city: 'Windhoek',
      region: 'Khomas',
      postalCode: '10001',
      countryCode: CountryCode.NAMIBIA,
    },
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        productName: 'Widget',
        unitPrice: 400,
        currency: CurrencyCode.ZAR,
        quantity: 3,
        listingType: ListingType.PLATFORM,
      },
    ],
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T11:00:00.000Z',
    ...overrides,
  };
}

const ORDER_1 = makeOrder({ id: 'aaaaaaaa-0000-0000-0000-000000000001' });
const ORDER_2 = makeOrder({
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  status: OrderStatus.SHIPPED,
  total: 500,
  subtotal: 480,
  shippingTotal: 20,
});

// ─── Service stub ────────────────────────────────────────────────────────────

interface OrdersServiceStub {
  list: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  listForVendor: ReturnType<typeof vi.fn>;
  updateStatus: ReturnType<typeof vi.fn>;
}

function makeStub(overrides: Partial<OrdersServiceStub> = {}): OrdersServiceStub {
  return {
    list: vi.fn(() => of([ORDER_1, ORDER_2])),
    getById: vi.fn(() => of(ORDER_1)),
    create: vi.fn(),
    listForVendor: vi.fn(),
    updateStatus: vi.fn(),
    ...overrides,
  };
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function createComponent(stub: OrdersServiceStub): Promise<{
  component: ProfileOrders;
  fixture: ComponentFixture<ProfileOrders>;
  nativeEl: HTMLElement;
}> {
  await TestBed.configureTestingModule({
    imports: [ProfileOrders],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      { provide: OrdersService, useValue: stub },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ProfileOrders);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { component, fixture, nativeEl: fixture.nativeElement as HTMLElement };
}

// ─── List view ────────────────────────────────────────────────────────────────

describe('ProfileOrders — list view', () => {
  let component: ProfileOrders;
  let fixture: ComponentFixture<ProfileOrders>;
  let nativeEl: HTMLElement;
  let stub: OrdersServiceStub;

  beforeEach(async () => {
    stub = makeStub();
    ({ component, fixture, nativeEl } = await createComponent(stub));
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('calls OrdersService.list on init and clears loading', () => {
    expect(stub.list).toHaveBeenCalledTimes(1);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('');
  });

  it('renders one row per order', () => {
    const rows = nativeEl.querySelectorAll('.order-row');
    expect(rows.length).toBe(2);
  });

  it('shows status, total/currency, and date per row', () => {
    const rows = nativeEl.querySelectorAll('.order-row');
    expect(rows[0].textContent).toContain('Pending');
    expect(rows[0].textContent).toContain('R');
    expect(rows[0].textContent).toContain('250,00'); // 1250 formatted en-ZA
    expect(rows[1].textContent).toContain('Shipped');
  });

  it('shows a short id prefix in each row', () => {
    const rows = nativeEl.querySelectorAll('.order-row');
    expect(rows[0].textContent).toContain('#aaaaaaaa');
    expect(rows[1].textContent).toContain('#bbbbbbbb');
  });

  it('does not render any mutation buttons (cancel/reorder/status change)', () => {
    const html = nativeEl.innerHTML.toLowerCase();
    expect(html).not.toContain('cancel');
    expect(html).not.toContain('reorder');
  });
});

// ─── Empty state ─────────────────────────────────────────────────────────────

describe('ProfileOrders — empty state', () => {
  it('shows "No orders yet" with a link to /shop when there are no orders', async () => {
    const stub = makeStub({ list: vi.fn(() => of([])) });
    const { nativeEl, component } = await createComponent(stub);

    expect(component.hasOrders()).toBe(false);
    const emptyEl = nativeEl.querySelector('.empty-state');
    expect(emptyEl).not.toBeNull();
    expect(emptyEl!.textContent).toContain('No orders yet');

    const link = nativeEl.querySelector('a[routerLink="/shop"]');
    expect(link).not.toBeNull();
  });
});

// ─── Load error path ─────────────────────────────────────────────────────────

describe('ProfileOrders — load error path', () => {
  it('sets error signal and clears loading when list() fails', async () => {
    const stub = makeStub({ list: vi.fn(() => throwError(() => new Error('500'))) });
    const { component } = await createComponent(stub);

    expect(component.loading()).toBe(false);
    expect(component.error()).toBeTruthy();
  });
});

// ─── Detail view ──────────────────────────────────────────────────────────────

describe('ProfileOrders — detail view', () => {
  let component: ProfileOrders;
  let fixture: ComponentFixture<ProfileOrders>;
  let nativeEl: HTMLElement;
  let stub: OrdersServiceStub;

  beforeEach(async () => {
    stub = makeStub();
    ({ component, fixture, nativeEl } = await createComponent(stub));
  });

  it('selecting an order fetches it by id and stores it', async () => {
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(stub.getById).toHaveBeenCalledWith(ORDER_1.id);
    expect(component.selectedOrder()?.id).toBe(ORDER_1.id);
  });

  it('renders line items with name, qty, unit price, and line total', async () => {
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const items = nativeEl.querySelectorAll('.line-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Widget');
    expect(items[0].textContent).toContain('Qty 3');
    expect(items[0].textContent).toContain('400');
    expect(items[0].textContent).toContain('200,00'); // 400 * 3 = 1200 line total, en-ZA formatted
    expect(component.lineTotal(400, 3)).toBe(1200);
  });

  it('renders the shipping address', async () => {
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const address = nativeEl.querySelector('.shipping-address');
    expect(address).not.toBeNull();
    expect(address!.textContent).toContain('Jane Doe');
    expect(address!.textContent).toContain('123 Main St');
    expect(address!.textContent).toContain('Windhoek');
  });

  it('renders subtotal, shipping, and total', async () => {
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const totals = nativeEl.querySelector('.totals-list');
    expect(totals).not.toBeNull();
    expect(totals!.textContent).toContain('200,00'); // subtotal (1200, en-ZA formatted)
    expect(totals!.textContent).toContain('50,00'); // shipping
    expect(totals!.textContent).toContain('250,00'); // total (1250, en-ZA formatted)
  });

  it('does not render any mutation buttons in the detail view', async () => {
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const html = nativeEl.innerHTML.toLowerCase();
    expect(html).not.toContain('cancel');
    expect(html).not.toContain('reorder');
  });

  it('backToList clears the selection and shows the list again', async () => {
    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.backToList();
    fixture.detectChanges();

    expect(component.selectedId()).toBeNull();
    expect(nativeEl.querySelector('.order-list')).not.toBeNull();
  });

  it('sets detailError when getById fails', async () => {
    stub.getById.mockReturnValue(throwError(() => new Error('404')));

    component.selectOrder(ORDER_1.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.detailLoading()).toBe(false);
    expect(component.detailError()).toBeTruthy();
  });
});
