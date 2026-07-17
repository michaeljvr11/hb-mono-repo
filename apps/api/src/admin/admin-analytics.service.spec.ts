import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AnalyticsEventType, CurrencyCode, ListingType, OrderStatus } from '@hb/shared';
import { AdminAnalyticsService } from './admin-analytics.service';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { AnalyticsEvent } from '../analytics/entities/analytics-event.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeQb(overrides: Record<string, jest.Mock> = {}) {
  const qb: Record<string, jest.Mock> = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    groupBy: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  Object.keys(qb).forEach((k) => {
    if (k !== 'getRawMany') qb[k].mockReturnValue(qb);
  });
  return qb;
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: OrderStatus.CONFIRMED,
    currency: CurrencyCode.ZAR,
    subtotal: 100,
    shippingTotal: 10,
    total: 110,
    originCountry: 'ZA',
    destinationCountry: 'NA',
    items: [],
    createdAt: new Date('2026-01-15T12:00:00.000Z'),
    updatedAt: new Date('2026-01-15T12:00:00.000Z'),
    ...overrides,
  } as Order;
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    orderId: 'order-1',
    productName: 'Widget',
    unitPrice: '50.00' as never, // pg returns numeric as string
    currency: CurrencyCode.ZAR,
    quantity: 1,
    listingType: ListingType.PLATFORM,
    createdAt: new Date('2026-01-15T12:00:00.000Z'),
    ...overrides,
  } as OrderItem;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;
  let ordersRepo: Record<string, jest.Mock>;
  let analyticsEventRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    ordersRepo = { find: jest.fn().mockResolvedValue([]) };
    analyticsEventRepo = { createQueryBuilder: jest.fn().mockReturnValue(makeQb()) };

    const module = await Test.createTestingModule({
      providers: [
        AdminAnalyticsService,
        { provide: getRepositoryToken(Order), useValue: ordersRepo },
        { provide: getRepositoryToken(AnalyticsEvent), useValue: analyticsEventRepo },
      ],
    }).compile();

    service = module.get(AdminAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── zero data ────────────────────────────────────────────────────────────

  describe('getSummary — zero data', () => {
    it('zero-fills every AnalyticsEventType, returns empty timeSeries/revenue, conversionRate 0, and never throws', async () => {
      const result = await service.getSummary({});

      expect(result.funnel).toHaveLength(7);
      expect(result.funnel.every((f) => f.sessions === 0)).toBe(true);
      const stages = result.funnel.map((f) => f.stage);
      for (const t of Object.values(AnalyticsEventType)) {
        expect(stages).toContain(t);
      }
      expect(result.timeSeries).toEqual([]);
      expect(result.revenueByCurrency).toEqual([]);
      expect(result.conversionRate).toBe(0);
    });
  });

  // ─── revenue by currency ────────────────────────────────────────────────

  describe('getSummary — revenue by currency', () => {
    it('keeps ZAR and NAD as separate entries and never sums them together', async () => {
      const order = makeOrder({
        status: OrderStatus.CONFIRMED,
        createdAt: new Date('2026-01-10T00:00:00.000Z'),
        items: [
          makeItem({
            id: 'item-1',
            currency: CurrencyCode.ZAR,
            unitPrice: '100.00' as never,
            quantity: 1,
          }),
          makeItem({
            id: 'item-2',
            currency: CurrencyCode.NAD,
            unitPrice: '80.00' as never,
            quantity: 1,
          }),
        ],
      });
      ordersRepo.find.mockResolvedValue([order]);

      const result = await service.getSummary({ from: '2026-01-01', to: '2026-01-31' });

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

  // ─── cancelled orders excluded ───────────────────────────────────────────

  describe('getSummary — cancelled orders excluded', () => {
    it('excludes cancelled orders from both the orders count and revenue', async () => {
      const cancelled = makeOrder({
        id: 'o1',
        status: OrderStatus.CANCELLED,
        createdAt: new Date('2026-01-10T00:00:00.000Z'),
        items: [makeItem({ id: 'item-1', unitPrice: '500.00' as never })],
      });
      const confirmed = makeOrder({
        id: 'o2',
        status: OrderStatus.CONFIRMED,
        createdAt: new Date('2026-01-11T00:00:00.000Z'),
        items: [makeItem({ id: 'item-2', unitPrice: '50.00' as never })],
      });
      ordersRepo.find.mockResolvedValue([cancelled, confirmed]);

      const result = await service.getSummary({ from: '2026-01-01', to: '2026-01-31' });

      expect(result.revenueByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 50 }]);
      const totalOrders = result.timeSeries.reduce((sum, p) => sum + p.orders, 0);
      expect(totalOrders).toBe(1);
    });
  });

  // ─── gross line GMV (unitPrice * quantity, not order.total) ─────────────

  describe('getSummary — gross line GMV', () => {
    it('multiplies unitPrice by quantity per line rather than counting unitPrice once', async () => {
      const order = makeOrder({
        id: 'o1',
        createdAt: new Date('2026-01-10T00:00:00.000Z'),
        items: [makeItem({ id: 'item-1', unitPrice: '25.00' as never, quantity: 3 })],
      });
      ordersRepo.find.mockResolvedValue([order]);

      const result = await service.getSummary({ from: '2026-01-01', to: '2026-01-31' });

      // 25.00 * 3, NOT 25.00 flat.
      expect(result.revenueByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 75 }]);
    });

    it('rounds accumulated floating-point drift to exactly 2dp across multiple lines', async () => {
      const order = makeOrder({
        id: 'o1',
        createdAt: new Date('2026-01-10T00:00:00.000Z'),
        items: [
          makeItem({ id: 'item-1', unitPrice: '10.10' as never, quantity: 1 }),
          makeItem({ id: 'item-2', unitPrice: '10.10' as never, quantity: 1 }),
          makeItem({ id: 'item-3', unitPrice: '10.10' as never, quantity: 1 }),
        ],
      });
      ordersRepo.find.mockResolvedValue([order]);

      const result = await service.getSummary({ from: '2026-01-01', to: '2026-01-31' });

      // 10.10 + 10.10 + 10.10 === 30.299999999999997 in raw floating point —
      // must round cleanly to 30.3, not leak the drift into the response.
      expect(result.revenueByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 30.3 }]);
    });
  });

  // ─── conversion rate ──────────────────────────────────────────────────────

  describe('getSummary — conversion rate', () => {
    it('computes distinct ORDER_COMPLETED sessions / distinct PRODUCT_VIEWED sessions', async () => {
      analyticsEventRepo.createQueryBuilder.mockReturnValue(
        makeQb({
          getRawMany: jest.fn().mockResolvedValue([
            { type: AnalyticsEventType.PRODUCT_VIEWED, sessions: '10' },
            { type: AnalyticsEventType.ORDER_COMPLETED, sessions: '3' },
          ]),
        }),
      );

      const result = await service.getSummary({ from: '2026-01-01', to: '2026-01-31' });

      expect(result.conversionRate).toBe(0.3);
    });

    it('returns 0 (never NaN/Infinity) when there are zero PRODUCT_VIEWED sessions', async () => {
      analyticsEventRepo.createQueryBuilder.mockReturnValue(
        makeQb({
          getRawMany: jest
            .fn()
            .mockResolvedValue([{ type: AnalyticsEventType.ORDER_COMPLETED, sessions: '3' }]),
        }),
      );

      const result = await service.getSummary({ from: '2026-01-01', to: '2026-01-31' });

      expect(result.conversionRate).toBe(0);
      expect(Number.isFinite(result.conversionRate)).toBe(true);
    });
  });

  // ─── bucketing ────────────────────────────────────────────────────────────

  describe('getSummary — bucketing', () => {
    it('buckets two orders on different days into separate day buckets', async () => {
      const orderA = makeOrder({
        id: 'o1',
        createdAt: new Date('2026-01-05T08:00:00.000Z'),
        items: [makeItem({ id: 'item-1', unitPrice: '10.00' as never })],
      });
      const orderB = makeOrder({
        id: 'o2',
        createdAt: new Date('2026-01-06T08:00:00.000Z'),
        items: [makeItem({ id: 'item-2', unitPrice: '20.00' as never })],
      });
      ordersRepo.find.mockResolvedValue([orderA, orderB]);

      const result = await service.getSummary({
        from: '2026-01-01',
        to: '2026-01-31',
        granularity: 'day',
      });

      expect(result.timeSeries).toHaveLength(2);
      expect(result.timeSeries[0].date).toBe('2026-01-05');
      expect(result.timeSeries[0].orders).toBe(1);
      expect(result.timeSeries[1].date).toBe('2026-01-06');
      expect(result.timeSeries[1].orders).toBe(1);
    });

    it('groups orders in the same month into one bucket when granularity is month', async () => {
      const orderA = makeOrder({
        id: 'o1',
        createdAt: new Date('2026-01-05T08:00:00.000Z'),
        items: [makeItem({ id: 'item-1', unitPrice: '10.00' as never })],
      });
      const orderB = makeOrder({
        id: 'o2',
        createdAt: new Date('2026-01-25T08:00:00.000Z'),
        items: [makeItem({ id: 'item-2', unitPrice: '20.00' as never })],
      });
      ordersRepo.find.mockResolvedValue([orderA, orderB]);

      const result = await service.getSummary({
        from: '2026-01-01',
        to: '2026-01-31',
        granularity: 'month',
      });

      expect(result.timeSeries).toHaveLength(1);
      expect(result.timeSeries[0].date).toBe('2026-01-01');
      expect(result.timeSeries[0].orders).toBe(2);
      expect(result.timeSeries[0].revenueByCurrency).toEqual([
        { currency: CurrencyCode.ZAR, amount: 30 },
      ]);
    });
  });

  // ─── invalid range ────────────────────────────────────────────────────────

  describe('getSummary — invalid range', () => {
    it('throws BadRequestException when from is after to', async () => {
      await expect(
        service.getSummary({ from: '2026-02-01', to: '2026-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
