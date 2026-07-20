import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AnalyticsEventType,
  CurrencyCode,
  ListingType,
  OrderStatus,
  VendorStatus,
} from '@hb/shared';
import { VendorAnalyticsService } from './vendor-analytics.service';
import { Vendor } from './entities/vendor.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { AnalyticsEvent } from '../analytics/entities/analytics-event.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 'v1',
    userId: 'u1',
    businessName: 'Roots & Shoots Art',
    status: VendorStatus.APPROVED,
    countryCode: 'ZA',
    ...overrides,
  } as Vendor;
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    status: OrderStatus.CONFIRMED,
    createdAt: new Date('2026-01-15T12:00:00.000Z'),
    ...overrides,
  } as Order;
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    orderId: 'order-1',
    order: makeOrder(),
    vendorId: 'v1',
    productName: 'Widget',
    unitPrice: '50.00' as never, // pg returns numeric as string
    currency: CurrencyCode.ZAR,
    quantity: 1,
    listingType: ListingType.VENDOR,
    createdAt: new Date('2026-01-15T12:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Simulates a real WHERE-clause-filtered TypeORM query builder: `.where()` captures the
 * `vendorId` bind param, and `getMany()` only ever returns rows matching it — exactly what
 * Postgres would do. This makes the tenant-isolation tests meaningful even with mocked repos:
 * a bug that dropped/mis-bound the vendorId filter would leak cross-vendor rows here too.
 */
function makeItemsQb(allItems: OrderItem[]) {
  let vendorIdFilter: string | undefined;
  const qb: Record<string, jest.Mock> = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn((_cond: string, params?: { vendorId?: string }) => {
      vendorIdFilter = params?.vendorId;
      return qb;
    }),
    andWhere: jest.fn(),
    getMany: jest.fn(() => Promise.resolve(allItems.filter((i) => i.vendorId === vendorIdFilter))),
  };
  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  return qb;
}

function makeEventsQb(allRows: { type: AnalyticsEventType; sessions: string; vendorId: string }[]) {
  let vendorIdFilter: string | undefined;
  const qb: Record<string, jest.Mock> = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn((_cond: string, params?: { vendorId?: string }) => {
      vendorIdFilter = params?.vendorId;
      return qb;
    }),
    andWhere: jest.fn(),
    groupBy: jest.fn(),
    getRawMany: jest.fn(() =>
      Promise.resolve(
        allRows
          .filter((r) => r.vendorId === vendorIdFilter)
          .map(({ type, sessions }) => ({ type, sessions })),
      ),
    ),
  };
  qb.select.mockReturnValue(qb);
  qb.addSelect.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.groupBy.mockReturnValue(qb);
  return qb;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('VendorAnalyticsService', () => {
  let service: VendorAnalyticsService;
  let vendorRepo: Record<string, jest.Mock>;
  let orderItemRepo: Record<string, jest.Mock>;
  let analyticsEventRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    vendorRepo = { findOne: jest.fn() };
    orderItemRepo = { createQueryBuilder: jest.fn().mockReturnValue(makeItemsQb([])) };
    analyticsEventRepo = { createQueryBuilder: jest.fn().mockReturnValue(makeEventsQb([])) };

    const module = await Test.createTestingModule({
      providers: [
        VendorAnalyticsService,
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: getRepositoryToken(AnalyticsEvent), useValue: analyticsEventRepo },
      ],
    }).compile();

    service = module.get(VendorAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── vendor resolution (VP-2) ─────────────────────────────────────────────

  describe('getAnalytics — vendor resolution', () => {
    it('resolves the vendor from the authenticated userId, never a client-supplied id', async () => {
      vendorRepo.findOne.mockResolvedValue(makeVendor({ id: 'v1', userId: 'u1' }));

      await service.getAnalytics('u1', {});

      expect(vendorRepo.findOne).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    });

    it('throws NotFoundException when the requesting user has no vendor profile', async () => {
      vendorRepo.findOne.mockResolvedValue(null);

      await expect(service.getAnalytics('no-such-user', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(orderItemRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(analyticsEventRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ─── tenant isolation (non-negotiable) ────────────────────────────────────

  describe('getAnalytics — tenant isolation', () => {
    it("never includes vendor B's order lines/events in vendor A's aggregation", async () => {
      vendorRepo.findOne.mockResolvedValue(makeVendor({ id: 'vA', userId: 'userA' }));

      const items = [
        makeItem({
          id: 'itemA',
          orderId: 'orderA',
          vendorId: 'vA',
          currency: CurrencyCode.ZAR,
          unitPrice: '100.00' as never,
          order: makeOrder({ id: 'orderA', status: OrderStatus.CONFIRMED }),
        }),
        makeItem({
          id: 'itemB',
          orderId: 'orderB',
          vendorId: 'vB',
          currency: CurrencyCode.ZAR,
          unitPrice: '9999.00' as never,
          order: makeOrder({ id: 'orderB', status: OrderStatus.CONFIRMED }),
        }),
      ];
      const events = [
        { type: AnalyticsEventType.PRODUCT_VIEWED, sessions: '4', vendorId: 'vA' },
        { type: AnalyticsEventType.PRODUCT_VIEWED, sessions: '999', vendorId: 'vB' },
      ];

      const itemsQb = makeItemsQb(items);
      const eventsQb = makeEventsQb(events);
      orderItemRepo.createQueryBuilder.mockReturnValue(itemsQb);
      analyticsEventRepo.createQueryBuilder.mockReturnValue(eventsQb);

      const result = await service.getAnalytics('userA', {
        from: '2026-01-01',
        to: '2026-01-31',
      });

      // Only vendor A's revenue/order — vendor B's 9999 never leaks in.
      expect(result.revenueByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 100 }]);
      expect(result.orderCount).toBe(1);
      // Only vendor A's funnel sessions — vendor B's 999 never leaks in.
      const viewed = result.funnel.find((f) => f.stage === AnalyticsEventType.PRODUCT_VIEWED);
      expect(viewed?.sessions).toBe(4);

      // The underlying queries were parameterised with vendor A's id, not vendor B's.
      expect(itemsQb.where).toHaveBeenCalledWith('oi.vendorId = :vendorId', { vendorId: 'vA' });
      expect(eventsQb.where).toHaveBeenCalledWith('e.vendorId = :vendorId', { vendorId: 'vA' });
    });
  });

  // ─── revenue by currency ────────────────────────────────────────────────

  describe('getAnalytics — revenue by currency', () => {
    it('keeps ZAR and NAD as separate entries and never sums them together', async () => {
      vendorRepo.findOne.mockResolvedValue(makeVendor());

      const items = [
        makeItem({
          id: 'item-1',
          vendorId: 'v1',
          currency: CurrencyCode.ZAR,
          unitPrice: '100.00' as never,
        }),
        makeItem({
          id: 'item-2',
          vendorId: 'v1',
          currency: CurrencyCode.NAD,
          unitPrice: '80.00' as never,
        }),
      ];
      orderItemRepo.createQueryBuilder.mockReturnValue(makeItemsQb(items));

      const result = await service.getAnalytics('u1', { from: '2026-01-01', to: '2026-01-31' });

      expect(result.revenueByCurrency).toHaveLength(2);
      const zar = result.revenueByCurrency.find((r) => r.currency === CurrencyCode.ZAR);
      const nad = result.revenueByCurrency.find((r) => r.currency === CurrencyCode.NAD);
      expect(zar?.amount).toBe(100);
      expect(nad?.amount).toBe(80);
      expect(result.revenueByCurrency).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ amount: 180 })]),
      );
    });
  });

  // ─── gross line GMV (unitPrice * quantity, not order.total) ─────────────

  describe('getAnalytics — gross line GMV', () => {
    it('multiplies unitPrice by quantity per line rather than counting unitPrice once', async () => {
      vendorRepo.findOne.mockResolvedValue(makeVendor());

      const items = [
        makeItem({
          id: 'item-1',
          vendorId: 'v1',
          unitPrice: '25.00' as never,
          quantity: 3,
        }),
      ];
      orderItemRepo.createQueryBuilder.mockReturnValue(makeItemsQb(items));

      const result = await service.getAnalytics('u1', { from: '2026-01-01', to: '2026-01-31' });

      // 25.00 * 3, NOT 25.00 flat.
      expect(result.revenueByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 75 }]);
    });

    it('rounds accumulated floating-point drift to exactly 2dp across multiple lines', async () => {
      vendorRepo.findOne.mockResolvedValue(makeVendor());

      const items = [
        makeItem({ id: 'item-1', orderId: 'o1', vendorId: 'v1', unitPrice: '10.10' as never }),
        makeItem({ id: 'item-2', orderId: 'o1', vendorId: 'v1', unitPrice: '10.10' as never }),
        makeItem({ id: 'item-3', orderId: 'o1', vendorId: 'v1', unitPrice: '10.10' as never }),
      ];
      orderItemRepo.createQueryBuilder.mockReturnValue(makeItemsQb(items));

      const result = await service.getAnalytics('u1', { from: '2026-01-01', to: '2026-01-31' });

      // 10.10 + 10.10 + 10.10 === 30.299999999999997 in raw floating point —
      // must round cleanly to 30.3, not leak the drift into the response.
      expect(result.revenueByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 30.3 }]);
    });
  });

  // ─── cancelled orders excluded ───────────────────────────────────────────

  describe('getAnalytics — cancelled orders excluded', () => {
    it('excludes cancelled orders from both orderCount and revenue', async () => {
      vendorRepo.findOne.mockResolvedValue(makeVendor());

      const items = [
        makeItem({
          id: 'item-1',
          orderId: 'o1',
          vendorId: 'v1',
          unitPrice: '500.00' as never,
          order: makeOrder({ id: 'o1', status: OrderStatus.CANCELLED }),
        }),
        makeItem({
          id: 'item-2',
          orderId: 'o2',
          vendorId: 'v1',
          unitPrice: '50.00' as never,
          order: makeOrder({ id: 'o2', status: OrderStatus.CONFIRMED }),
        }),
      ];
      orderItemRepo.createQueryBuilder.mockReturnValue(makeItemsQb(items));

      const result = await service.getAnalytics('u1', { from: '2026-01-01', to: '2026-01-31' });

      expect(result.revenueByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 50 }]);
      expect(result.orderCount).toBe(1);
    });
  });

  // ─── zero data ────────────────────────────────────────────────────────────

  describe('getAnalytics — zero data', () => {
    it('zero-fills every AnalyticsEventType, returns empty timeSeries/revenue, orderCount 0, never throws', async () => {
      vendorRepo.findOne.mockResolvedValue(makeVendor());

      const result = await service.getAnalytics('u1', {});

      expect(result.funnel).toHaveLength(7);
      expect(result.funnel.every((f) => f.sessions === 0)).toBe(true);
      const stages = result.funnel.map((f) => f.stage);
      for (const t of Object.values(AnalyticsEventType)) {
        expect(stages).toContain(t);
      }
      expect(result.timeSeries).toEqual([]);
      expect(result.revenueByCurrency).toEqual([]);
      expect(result.orderCount).toBe(0);
    });
  });

  // ─── invalid range ────────────────────────────────────────────────────────

  describe('getAnalytics — invalid range', () => {
    it('throws BadRequestException when from is after to', async () => {
      vendorRepo.findOne.mockResolvedValue(makeVendor());

      await expect(
        service.getAnalytics('u1', { from: '2026-02-01', to: '2026-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── time series bucketing (orders scoped to vendor's lines) ─────────────

  describe('getAnalytics — time series', () => {
    it('buckets vendor orders by day and counts a multi-line order once per bucket', async () => {
      vendorRepo.findOne.mockResolvedValue(makeVendor());

      const items = [
        makeItem({
          id: 'item-1',
          orderId: 'o1',
          vendorId: 'v1',
          unitPrice: '10.00' as never,
          order: makeOrder({ id: 'o1', createdAt: new Date('2026-01-05T08:00:00.000Z') }),
        }),
        // Second line on the SAME order — should not double-count orders in the bucket.
        makeItem({
          id: 'item-2',
          orderId: 'o1',
          vendorId: 'v1',
          unitPrice: '15.00' as never,
          order: makeOrder({ id: 'o1', createdAt: new Date('2026-01-05T08:00:00.000Z') }),
        }),
        makeItem({
          id: 'item-3',
          orderId: 'o2',
          vendorId: 'v1',
          unitPrice: '20.00' as never,
          order: makeOrder({ id: 'o2', createdAt: new Date('2026-01-06T08:00:00.000Z') }),
        }),
      ];
      orderItemRepo.createQueryBuilder.mockReturnValue(makeItemsQb(items));

      const result = await service.getAnalytics('u1', {
        from: '2026-01-01',
        to: '2026-01-31',
        granularity: 'day',
      });

      expect(result.timeSeries).toHaveLength(2);
      expect(result.timeSeries[0]).toEqual({
        date: '2026-01-05',
        orders: 1,
        revenueByCurrency: [{ currency: CurrencyCode.ZAR, amount: 25 }],
      });
      expect(result.timeSeries[1]).toEqual({
        date: '2026-01-06',
        orders: 1,
        revenueByCurrency: [{ currency: CurrencyCode.ZAR, amount: 20 }],
      });
      expect(result.orderCount).toBe(2);
    });
  });
});
