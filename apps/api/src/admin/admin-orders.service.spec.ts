import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CurrencyCode, ListingType, OrderStatus, VendorStatus } from '@hb/shared';
import { AdminOrdersService } from './admin-orders.service';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Vendor } from '../vendors/entities/vendor.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-01-15T12:00:00.000Z');
const LATER = new Date('2026-01-20T12:00:00.000Z');

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'customer@hb.com',
    firstName: 'Jane',
    lastName: 'Doe',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    user: makeUser() as never,
    status: OrderStatus.CONFIRMED,
    currency: CurrencyCode.ZAR,
    subtotal: 100,
    shippingTotal: 10,
    total: '110' as never, // pg returns numeric as string
    originCountry: 'ZA',
    destinationCountry: 'NA',
    items: [],
    createdAt: NOW,
    updatedAt: LATER,
    ...overrides,
  };
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    orderId: 'order-1',
    order: makeOrder(),
    productName: 'Widget',
    unitPrice: '50.00' as never, // pg returns numeric as string
    currency: CurrencyCode.ZAR,
    quantity: 1,
    listingType: ListingType.PLATFORM,
    createdAt: NOW,
    ...overrides,
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AdminOrdersService', () => {
  let service: AdminOrdersService;
  let ordersRepo: Record<string, jest.Mock>;
  let orderItemRepo: Record<string, jest.Mock>;
  let vendorRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    ordersRepo = { find: jest.fn(), count: jest.fn() };
    orderItemRepo = { find: jest.fn() };
    vendorRepo = { count: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AdminOrdersService,
        { provide: getRepositoryToken(Order), useValue: ordersRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
      ],
    }).compile();

    service = module.get(AdminOrdersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getDashboard — empty data ────────────────────────────────────────────

  describe('getDashboard — empty data', () => {
    it('returns zeros and empty arrays when there are no orders or vendors', async () => {
      vendorRepo.count.mockResolvedValue(0);
      ordersRepo.find.mockResolvedValue([]);
      orderItemRepo.find.mockResolvedValue([]);

      const result = await service.getDashboard();

      expect(result.pendingVendorCount).toBe(0);
      expect(result.totalOrders).toBe(0);
      expect(result.platformRevenue).toEqual([]);
      expect(result.vendorRevenue).toEqual([]);
    });

    it('zero-fills every OrderStatus in orderCountsByStatus even when orders is empty', async () => {
      vendorRepo.count.mockResolvedValue(0);
      ordersRepo.find.mockResolvedValue([]);
      orderItemRepo.find.mockResolvedValue([]);

      const result = await service.getDashboard();
      const statuses = result.orderCountsByStatus.map((e) => e.status);

      for (const s of Object.values(OrderStatus)) {
        expect(statuses).toContain(s);
      }
      expect(result.orderCountsByStatus.every((e) => e.count === 0)).toBe(true);
    });
  });

  // ─── getDashboard — pendingVendorCount ────────────────────────────────────

  describe('getDashboard — pendingVendorCount', () => {
    it('reads pendingVendorCount from vendorRepo.count with status PENDING', async () => {
      vendorRepo.count.mockResolvedValue(3);
      ordersRepo.find.mockResolvedValue([]);
      orderItemRepo.find.mockResolvedValue([]);

      const result = await service.getDashboard();

      expect(vendorRepo.count).toHaveBeenCalledWith({ where: { status: VendorStatus.PENDING } });
      expect(result.pendingVendorCount).toBe(3);
    });
  });

  // ─── getDashboard — orderCountsByStatus ───────────────────────────────────

  describe('getDashboard — orderCountsByStatus', () => {
    it('contains an entry for every OrderStatus', async () => {
      vendorRepo.count.mockResolvedValue(0);
      ordersRepo.find.mockResolvedValue([
        makeOrder({ status: OrderStatus.PENDING }),
        makeOrder({ id: 'order-2', status: OrderStatus.CONFIRMED }),
        makeOrder({ id: 'order-3', status: OrderStatus.CONFIRMED }),
      ]);
      orderItemRepo.find.mockResolvedValue([]);

      const result = await service.getDashboard();

      for (const s of Object.values(OrderStatus)) {
        expect(result.orderCountsByStatus.find((e) => e.status === s)).toBeDefined();
      }
    });

    it('tallies orders per status correctly', async () => {
      vendorRepo.count.mockResolvedValue(0);
      ordersRepo.find.mockResolvedValue([
        makeOrder({ status: OrderStatus.PENDING }),
        makeOrder({ id: 'order-2', status: OrderStatus.CONFIRMED }),
        makeOrder({ id: 'order-3', status: OrderStatus.CONFIRMED }),
      ]);
      orderItemRepo.find.mockResolvedValue([]);

      const result = await service.getDashboard();

      const pendingEntry = result.orderCountsByStatus.find((e) => e.status === OrderStatus.PENDING);
      const confirmedEntry = result.orderCountsByStatus.find(
        (e) => e.status === OrderStatus.CONFIRMED,
      );
      expect(pendingEntry?.count).toBe(1);
      expect(confirmedEntry?.count).toBe(2);
    });
  });

  // ─── getDashboard — revenue: platform vs vendor split ────────────────────

  describe('getDashboard — revenue platform vs vendor split', () => {
    it('routes PLATFORM items to platformRevenue and VENDOR items to vendorRevenue', async () => {
      vendorRepo.count.mockResolvedValue(0);
      ordersRepo.find.mockResolvedValue([]);
      const confirmedOrder = makeOrder({ status: OrderStatus.CONFIRMED });
      orderItemRepo.find.mockResolvedValue([
        makeItem({
          listingType: ListingType.PLATFORM,
          unitPrice: '100.00' as never,
          quantity: 1,
          currency: CurrencyCode.ZAR,
          order: confirmedOrder,
        }),
        makeItem({
          id: 'item-2',
          listingType: ListingType.VENDOR,
          unitPrice: '200.00' as never,
          quantity: 1,
          currency: CurrencyCode.ZAR,
          order: confirmedOrder,
        }),
      ]);

      const result = await service.getDashboard();

      expect(result.platformRevenue).toEqual([{ currency: CurrencyCode.ZAR, amount: 100 }]);
      expect(result.vendorRevenue).toEqual([{ currency: CurrencyCode.ZAR, amount: 200 }]);
    });
  });

  // ─── getDashboard — revenue: ZAR and NAD kept separate ───────────────────

  describe('getDashboard — revenue currency grouping', () => {
    it('keeps ZAR and NAD as separate entries and does NOT sum them together', async () => {
      vendorRepo.count.mockResolvedValue(0);
      ordersRepo.find.mockResolvedValue([]);
      const confirmedOrder = makeOrder({ status: OrderStatus.CONFIRMED });
      orderItemRepo.find.mockResolvedValue([
        makeItem({
          listingType: ListingType.PLATFORM,
          unitPrice: '100.00' as never,
          quantity: 1,
          currency: CurrencyCode.ZAR,
          order: confirmedOrder,
        }),
        makeItem({
          id: 'item-2',
          listingType: ListingType.PLATFORM,
          unitPrice: '80.00' as never,
          quantity: 1,
          currency: CurrencyCode.NAD,
          order: confirmedOrder,
        }),
      ]);

      const result = await service.getDashboard();

      expect(result.platformRevenue).toHaveLength(2);
      const zarEntry = result.platformRevenue.find((e) => e.currency === CurrencyCode.ZAR);
      const nadEntry = result.platformRevenue.find((e) => e.currency === CurrencyCode.NAD);
      expect(zarEntry?.amount).toBe(100);
      expect(nadEntry?.amount).toBe(80);
      // Guard: the two currencies must NOT have been summed into one entry
      expect(result.platformRevenue).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ amount: 180 })]),
      );
    });
  });

  // ─── getDashboard — revenue: CANCELLED orders excluded ───────────────────

  describe('getDashboard — revenue excludes CANCELLED order lines', () => {
    it('skips items whose parent order is CANCELLED', async () => {
      vendorRepo.count.mockResolvedValue(0);
      ordersRepo.find.mockResolvedValue([]);
      const cancelledOrder = makeOrder({ status: OrderStatus.CANCELLED });
      const confirmedOrder = makeOrder({ id: 'order-2', status: OrderStatus.CONFIRMED });
      orderItemRepo.find.mockResolvedValue([
        makeItem({
          listingType: ListingType.PLATFORM,
          unitPrice: '500.00' as never,
          quantity: 1,
          currency: CurrencyCode.ZAR,
          order: cancelledOrder,
        }),
        makeItem({
          id: 'item-2',
          listingType: ListingType.PLATFORM,
          unitPrice: '50.00' as never,
          quantity: 1,
          currency: CurrencyCode.ZAR,
          order: confirmedOrder,
        }),
      ]);

      const result = await service.getDashboard();

      expect(result.platformRevenue).toEqual([{ currency: CurrencyCode.ZAR, amount: 50 }]);
    });

    it('returns empty revenue arrays when all orders are CANCELLED', async () => {
      vendorRepo.count.mockResolvedValue(0);
      ordersRepo.find.mockResolvedValue([]);
      const cancelledOrder = makeOrder({ status: OrderStatus.CANCELLED });
      orderItemRepo.find.mockResolvedValue([
        makeItem({
          listingType: ListingType.PLATFORM,
          unitPrice: '100.00' as never,
          quantity: 2,
          currency: CurrencyCode.ZAR,
          order: cancelledOrder,
        }),
      ]);

      const result = await service.getDashboard();

      expect(result.platformRevenue).toEqual([]);
      expect(result.vendorRevenue).toEqual([]);
    });
  });

  // ─── getDashboard — revenue: lineTotal = unitPrice * quantity (string coercion) ──

  describe('getDashboard — lineTotal coercion', () => {
    it('coerces pg numeric string unitPrice correctly and multiplies by quantity', async () => {
      vendorRepo.count.mockResolvedValue(0);
      ordersRepo.find.mockResolvedValue([]);
      const confirmedOrder = makeOrder({ status: OrderStatus.CONFIRMED });
      orderItemRepo.find.mockResolvedValue([
        makeItem({
          listingType: ListingType.PLATFORM,
          unitPrice: '25.50' as never, // pg numeric string
          quantity: 4,
          currency: CurrencyCode.ZAR,
          order: confirmedOrder,
        }),
      ]);

      const result = await service.getDashboard();

      // 25.50 * 4 = 102.00
      expect(result.platformRevenue).toEqual([{ currency: CurrencyCode.ZAR, amount: 102 }]);
    });

    it('rounds the aggregated amount to 2 decimal places', async () => {
      vendorRepo.count.mockResolvedValue(0);
      ordersRepo.find.mockResolvedValue([]);
      const confirmedOrder = makeOrder({ status: OrderStatus.CONFIRMED });
      orderItemRepo.find.mockResolvedValue([
        makeItem({
          listingType: ListingType.VENDOR,
          unitPrice: '33.33' as never,
          quantity: 3,
          currency: CurrencyCode.ZAR,
          order: confirmedOrder,
        }),
      ]);

      const result = await service.getDashboard();

      // 33.33 * 3 = 99.99 — exact, no rounding needed, but verify the rounding path executes
      expect(result.vendorRevenue[0].amount).toBe(99.99);
    });
  });

  // ─── listOrders — pagination shape ───────────────────────────────────────

  describe('listOrders — pagination shape', () => {
    it('returns the correct pagination envelope with default page and limit', async () => {
      ordersRepo.find.mockResolvedValue([]);

      const result = await service.listOrders({});

      expect(result).toMatchObject({ items: [], total: 0, page: 1, limit: 20, pageCount: 0 });
    });

    it('computes pageCount correctly for a partial last page', async () => {
      const orders = Array.from({ length: 25 }, (_, i) =>
        makeOrder({ id: `order-${i}`, items: [], user: makeUser() as never }),
      );
      ordersRepo.find.mockResolvedValue(orders);

      const result = await service.listOrders({ page: 1, limit: 10 });

      expect(result.total).toBe(25);
      expect(result.pageCount).toBe(3);
      expect(result.items).toHaveLength(10);
    });

    it('returns the correct slice for page 2', async () => {
      const orders = Array.from({ length: 25 }, (_, i) =>
        makeOrder({ id: `order-${i}`, items: [], user: makeUser() as never }),
      );
      ordersRepo.find.mockResolvedValue(orders);

      const result = await service.listOrders({ page: 2, limit: 10 });

      expect(result.items).toHaveLength(10);
      expect(result.page).toBe(2);
    });
  });

  // ─── listOrders — status filter ──────────────────────────────────────────

  describe('listOrders — status filter', () => {
    it('returns only orders matching the requested status', async () => {
      ordersRepo.find.mockResolvedValue([
        makeOrder({ id: 'o1', status: OrderStatus.PENDING, items: [], user: makeUser() as never }),
        makeOrder({
          id: 'o2',
          status: OrderStatus.CONFIRMED,
          items: [],
          user: makeUser() as never,
        }),
        makeOrder({ id: 'o3', status: OrderStatus.PENDING, items: [], user: makeUser() as never }),
      ]);

      const result = await service.listOrders({ status: OrderStatus.PENDING });

      expect(result.total).toBe(2);
      expect(result.items.every((i) => i.status === OrderStatus.PENDING)).toBe(true);
    });
  });

  // ─── listOrders — vendorId filter ────────────────────────────────────────

  describe('listOrders — vendorId filter', () => {
    it('returns only orders that have at least one item with the given vendorId', async () => {
      const matchingItem = makeItem({ vendorId: 'vendor-1' });
      const otherItem = makeItem({ id: 'item-other', vendorId: 'vendor-2' });

      ordersRepo.find.mockResolvedValue([
        makeOrder({ id: 'o1', items: [matchingItem], user: makeUser() as never }),
        makeOrder({ id: 'o2', items: [otherItem], user: makeUser() as never }),
      ]);

      const result = await service.listOrders({ vendorId: 'vendor-1' });

      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe('o1');
    });

    it('preserves ALL vendor ids on the order when filtering by one vendorId', async () => {
      const item1 = makeItem({ id: 'i1', vendorId: 'vendor-1' });
      const item2 = makeItem({ id: 'i2', vendorId: 'vendor-2' });

      ordersRepo.find.mockResolvedValue([
        makeOrder({ id: 'o1', items: [item1, item2], user: makeUser() as never }),
      ]);

      const result = await service.listOrders({ vendorId: 'vendor-1' });

      expect(result.items[0].vendorIds).toContain('vendor-1');
      expect(result.items[0].vendorIds).toContain('vendor-2');
      expect(result.items[0].itemCount).toBe(2);
    });
  });

  // ─── listOrders — item mapping ───────────────────────────────────────────

  describe('listOrders — item mapping', () => {
    it('maps an order to the correct AdminOrderListItemDto shape', async () => {
      const item = makeItem({ vendorId: 'vendor-1' });
      const order = makeOrder({
        id: 'o1',
        total: '110.00' as never,
        items: [item],
        user: makeUser({ email: 'jane@hb.com', firstName: 'Jane', lastName: 'Doe' }) as never,
      });
      ordersRepo.find.mockResolvedValue([order]);

      const result = await service.listOrders({});
      const dto = result.items[0];

      expect(dto.id).toBe('o1');
      expect(dto.total).toBe(110);
      expect(dto.customerEmail).toBe('jane@hb.com');
      expect(dto.customerName).toBe('Jane Doe');
      expect(dto.vendorIds).toEqual(['vendor-1']);
      expect(dto.itemCount).toBe(1);
      expect(dto.createdAt).toBe(NOW.toISOString());
      expect(dto.updatedAt).toBe(LATER.toISOString());
    });

    it('omits customerName when firstName or lastName is absent', async () => {
      const order = makeOrder({
        items: [],
        user: makeUser({ firstName: undefined, lastName: undefined }) as never,
      });
      ordersRepo.find.mockResolvedValue([order]);

      const result = await service.listOrders({});

      expect(result.items[0].customerName).toBeUndefined();
    });

    it('deduplicates vendorIds when multiple items share the same vendor', async () => {
      const item1 = makeItem({ id: 'i1', vendorId: 'vendor-1' });
      const item2 = makeItem({ id: 'i2', vendorId: 'vendor-1' });
      const order = makeOrder({ items: [item1, item2], user: makeUser() as never });
      ordersRepo.find.mockResolvedValue([order]);

      const result = await service.listOrders({});

      expect(result.items[0].vendorIds).toEqual(['vendor-1']);
    });

    it('returns an empty vendorIds array for all-platform orders', async () => {
      const item = makeItem({ listingType: ListingType.PLATFORM, vendorId: undefined });
      const order = makeOrder({ items: [item], user: makeUser() as never });
      ordersRepo.find.mockResolvedValue([order]);

      const result = await service.listOrders({});

      expect(result.items[0].vendorIds).toEqual([]);
    });
  });
});
