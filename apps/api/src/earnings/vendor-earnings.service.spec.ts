import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CurrencyCode, OrderStatus, PaymentStatus } from '@hb/shared';
import { VendorEarningsService } from './vendor-earnings.service';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';
import { SETTLEMENT_ANCHOR_DATE } from './earnings.constants';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    status: OrderStatus.DELIVERED,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    deliveredAt: new Date('2026-01-10T00:00:00.000Z'),
    ...overrides,
  } as Order;
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  const order = overrides.order ?? makeOrder();
  return {
    id: 'item-1',
    orderId: order.id,
    order,
    vendorId: 'vendor-1',
    productName: 'Widget',
    unitPrice: '100.00' as never, // pg returns numeric as string
    currency: CurrencyCode.ZAR,
    quantity: 1,
    commissionRatePercent: 15,
    ...overrides,
  } as OrderItem;
}

/**
 * Simulates a real WHERE-clause-filtered TypeORM query builder (mirrors
 * `VendorAnalyticsService`'s spec convention): `.where()`/`.andWhere()` bind
 * params actually filter `getMany()`'s results (vendorId scope, `o.status =
 * :delivered`), so a bug that dropped/mis-bound either filter is caught
 * here, not just asserted on the call args.
 */
function makeItemsQb(allItems: OrderItem[]) {
  let vendorIdFilter: string | undefined;
  let vendorFilterApplied = false;
  let statusFilter: OrderStatus | undefined;

  const captureParams = (params?: Record<string, unknown>) => {
    if (!params) return;
    if ('vendorId' in params) {
      vendorIdFilter = params.vendorId as string;
      vendorFilterApplied = true;
    }
    if ('delivered' in params) {
      statusFilter = params.delivered as OrderStatus;
    }
  };

  const qb: Record<string, jest.Mock> = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn((_cond: string, params?: Record<string, unknown>) => {
      captureParams(params);
      return qb;
    }),
    andWhere: jest.fn((_cond: string, params?: Record<string, unknown>) => {
      captureParams(params);
      return qb;
    }),
    getMany: jest.fn(() =>
      Promise.resolve(
        allItems.filter((item) => {
          if (vendorFilterApplied && item.vendorId !== vendorIdFilter) return false;
          if (statusFilter && item.order?.status !== statusFilter) return false;
          return true;
        }),
      ),
    ),
  };
  qb.leftJoinAndSelect.mockReturnValue(qb);
  return qb;
}

const FROM = new Date('2000-01-01T00:00:00.000Z');
const TO = new Date('2100-01-01T00:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('VendorEarningsService', () => {
  let service: VendorEarningsService;
  let orderItemRepo: Record<string, jest.Mock>;
  let paymentRepo: Record<string, jest.Mock>;

  function stageItems(items: OrderItem[]) {
    orderItemRepo.createQueryBuilder.mockReturnValue(makeItemsQb(items));
  }

  beforeEach(async () => {
    orderItemRepo = { createQueryBuilder: jest.fn() };
    paymentRepo = { find: jest.fn(() => Promise.resolve([])) };
    stageItems([]);

    const module = await Test.createTestingModule({
      providers: [
        VendorEarningsService,
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: getRepositoryToken(Payment), useValue: paymentRepo },
      ],
    }).compile();

    service = module.get(VendorEarningsService);
  });

  it('excludes a line inside the 48h claim window from every bucket, includes it in pendingClaimWindow', async () => {
    const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
    const now = new Date(deliveredAt.getTime() + 47 * HOUR_MS); // 1h short of eligible
    stageItems([makeItem({ order: makeOrder({ deliveredAt }) })]);

    const result = await service.getEarnings({}, FROM, TO, now);

    expect(result.pendingClaimWindow).toEqual([{ currency: CurrencyCode.ZAR, amount: 85 }]); // 100 - 15% commission
    expect(result.accrued).toEqual([]);
    expect(result.settlementPreview).toEqual([]);
  });

  it('marks a line past the 48h window eligible (accrued or settlementPreview)', async () => {
    const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
    const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS); // 1h past eligible
    stageItems([makeItem({ order: makeOrder({ deliveredAt }) })]);

    const result = await service.getEarnings({}, FROM, TO, now);

    expect(result.pendingClaimWindow).toEqual([]);
    const totalEligible = result.accrued.length + result.settlementPreview.length;
    expect(totalEligible).toBeGreaterThan(0);
  });

  it('treats exactly deliveredAt + 48h as eligible (inclusive boundary)', async () => {
    const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
    const now = new Date(deliveredAt.getTime() + 48 * HOUR_MS); // exact boundary
    stageItems([makeItem({ order: makeOrder({ deliveredAt }) })]);

    const result = await service.getEarnings({}, FROM, TO, now);

    expect(result.pendingClaimWindow).toEqual([]);
    // Same period as `now` (49h later is well within the same 14-day period) → accrued.
    expect(result.accrued).toEqual([{ currency: CurrencyCode.ZAR, amount: 85 }]);
  });

  it('excludes a cancelled order from every bucket', async () => {
    const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
    const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);
    stageItems([makeItem({ order: makeOrder({ deliveredAt, status: OrderStatus.CANCELLED }) })]);

    const result = await service.getEarnings({}, FROM, TO, now);

    expect(result.pendingClaimWindow).toEqual([]);
    expect(result.accrued).toEqual([]);
    expect(result.settlementPreview).toEqual([]);
  });

  it('excludes a line whose order has a refunded payment, from every bucket', async () => {
    const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
    const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);
    stageItems([makeItem({ order: makeOrder({ deliveredAt, id: 'order-refunded' }) })]);
    paymentRepo.find.mockResolvedValue([
      { orderId: 'order-refunded', status: PaymentStatus.REFUNDED },
    ]);

    const result = await service.getEarnings({}, FROM, TO, now);

    expect(result.pendingClaimWindow).toEqual([]);
    expect(result.accrued).toEqual([]);
    expect(result.settlementPreview).toEqual([]);
  });

  it('commission + net === gross across a range of rates, including drift-prone 15.55%', async () => {
    const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
    const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);

    for (const rate of [15, 15.55, 8.29, 0, 100, 33.33]) {
      stageItems([
        makeItem({
          order: makeOrder({ deliveredAt }),
          unitPrice: '10.00' as never,
          quantity: 1,
          commissionRatePercent: rate,
        }),
      ]);

      const result = await service.getEarnings({}, FROM, TO, now);
      const netTotal = [
        ...result.accrued,
        ...result.settlementPreview.flatMap((p) => p.netByCurrency),
      ];
      const net = netTotal[0].amount;
      const commission = Math.round(((10 * rate) / 100) * 100) / 100;
      // net + commission must reconstruct the exact gross, no drift.
      expect(Math.round((net + commission) * 100) / 100).toBe(10);
    }

    // Explicit non-drifting assertion for the documented 15.55% edge case:
    // gross=10.00, independently-rounded commission 1.56 + net 8.45 = 10.01 (drift).
    // Deriving net instead gives 1.56 + 8.44 = 10.00 exactly.
    stageItems([
      makeItem({
        order: makeOrder({ deliveredAt }),
        unitPrice: '10.00' as never,
        quantity: 1,
        commissionRatePercent: 15.55,
      }),
    ]);
    const result = await service.getEarnings({}, FROM, TO, now);
    const net = [...result.accrued, ...result.settlementPreview.flatMap((p) => p.netByCurrency)][0]
      .amount;
    expect(net).toBe(8.44);
  });

  it('rounds half-up correctly at a float-precision boundary: gross R50.00 at 8.29% -> 415c commission, 4585c net', async () => {
    // 5000 * 8.29 / 100 === 414.49999999999994 in IEEE 754 float, which
    // `Math.round` would misround down to 414 — the whole-integer
    // (rateHundredths, floor-with-+0.5) formula must land on 415 instead.
    const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
    const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);
    stageItems([
      makeItem({
        order: makeOrder({ deliveredAt }),
        unitPrice: '50.00' as never,
        quantity: 1,
        commissionRatePercent: 8.29,
      }),
    ]);

    const result = await service.getEarnings({}, FROM, TO, now);
    const net = [...result.accrued, ...result.settlementPreview.flatMap((p) => p.netByCurrency)][0]
      .amount;
    // net = gross - commission = 5000 - 415 = 4585 cents = R45.85
    expect(net).toBe(45.85);
  });

  it('never combines ZAR and NAD into one total', async () => {
    const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
    const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);
    stageItems([
      makeItem({
        id: 'zar-item',
        orderId: 'order-zar',
        order: makeOrder({ id: 'order-zar', deliveredAt }),
        currency: CurrencyCode.ZAR,
      }),
      makeItem({
        id: 'nad-item',
        orderId: 'order-nad',
        order: makeOrder({ id: 'order-nad', deliveredAt }),
        currency: CurrencyCode.NAD,
      }),
    ]);

    const result = await service.getEarnings({}, FROM, TO, now);

    expect(result.accrued).toHaveLength(2);
    expect(result.accrued).toEqual(
      expect.arrayContaining([
        { currency: CurrencyCode.ZAR, amount: 85 },
        { currency: CurrencyCode.NAD, amount: 85 },
      ]),
    );
  });

  it('scopes to the requested vendorId — a different vendor line is excluded', async () => {
    const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
    const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);
    stageItems([
      makeItem({
        id: 'mine',
        orderId: 'order-mine',
        order: makeOrder({ id: 'order-mine', deliveredAt }),
        vendorId: 'vendor-1',
      }),
      makeItem({
        id: 'theirs',
        orderId: 'order-theirs',
        order: makeOrder({ id: 'order-theirs', deliveredAt }),
        vendorId: 'vendor-2',
      }),
    ]);

    const result = await service.getEarnings({ vendorId: 'vendor-1' }, FROM, TO, now);

    // Only vendor-1's single line contributed — no double-counting from vendor-2.
    expect(result.accrued).toEqual([{ currency: CurrencyCode.ZAR, amount: 85 }]);
  });

  it('excludes a vendor line with a null commissionRatePercent from every bucket (data-integrity gap, never silently 0% commission)', async () => {
    const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
    const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS); // would otherwise be eligible
    stageItems([makeItem({ order: makeOrder({ deliveredAt }), commissionRatePercent: null })]);

    const result = await service.getEarnings({}, FROM, TO, now);

    expect(result.pendingClaimWindow).toEqual([]);
    expect(result.accrued).toEqual([]);
    expect(result.settlementPreview).toEqual([]);
  });

  it('platform lines never reach VendorEarningsService (excluded at the query level)', async () => {
    // The service always filters `oi.vendorId IS NOT NULL` — a platform line
    // simply never appears in what the (mocked) query builder returns here,
    // mirroring the real WHERE clause. Confirms the service adds no special
    // handling that would let a vendorId-less line slip into a bucket.
    stageItems([]);

    const result = await service.getEarnings({}, FROM, TO);

    expect(result.pendingClaimWindow).toEqual([]);
    expect(result.accrued).toEqual([]);
    expect(result.settlementPreview).toEqual([]);
  });

  describe('settlement-anchor bucketing', () => {
    it('a line delivered on the anchor date itself lands in the first period', async () => {
      const deliveredAt = new Date(SETTLEMENT_ANCHOR_DATE.getTime());
      const now = new Date(deliveredAt.getTime() + 30 * 24 * HOUR_MS); // well past, closed period
      stageItems([makeItem({ order: makeOrder({ deliveredAt }) })]);

      const result = await service.getEarnings({}, FROM, TO, now);

      expect(result.settlementPreview).toHaveLength(1);
      expect(result.settlementPreview[0].periodStart).toEqual(SETTLEMENT_ANCHOR_DATE);
      expect(result.settlementPreview[0].periodEnd).toEqual(
        new Date(SETTLEMENT_ANCHOR_DATE.getTime() + 14 * 24 * HOUR_MS),
      );
      expect(result.settlementPreview[0].orderCount).toBe(1);
    });

    it('a line delivered exactly 14 days after the anchor lands in the SECOND period', async () => {
      const deliveredAt = new Date(SETTLEMENT_ANCHOR_DATE.getTime() + 14 * 24 * HOUR_MS);
      const now = new Date(deliveredAt.getTime() + 30 * 24 * HOUR_MS); // well past, closed period
      stageItems([makeItem({ order: makeOrder({ deliveredAt }) })]);

      const result = await service.getEarnings({}, FROM, TO, now);

      expect(result.settlementPreview).toHaveLength(1);
      expect(result.settlementPreview[0].periodStart).toEqual(
        new Date(SETTLEMENT_ANCHOR_DATE.getTime() + 14 * 24 * HOUR_MS),
      );
      expect(result.settlementPreview[0].periodEnd).toEqual(
        new Date(SETTLEMENT_ANCHOR_DATE.getTime() + 28 * 24 * HOUR_MS),
      );
    });

    it('buckets on the eligibility instant (deliveredAt + 48h), not deliveredAt — a line delivered in the last 48h of a period lands in the NEXT period', async () => {
      // deliveredAt sits 1h before period 0's close ([anchor, anchor+14d)),
      // so eligibleAt = deliveredAt + 48h lands 47h into period 1
      // ([anchor+14d, anchor+28d)). Bucketing on deliveredAt (the bug) would
      // wrongly put this line in period 0.
      const deliveredAt = new Date(SETTLEMENT_ANCHOR_DATE.getTime() + 14 * 24 * HOUR_MS - HOUR_MS);
      const now = new Date(deliveredAt.getTime() + 30 * 24 * HOUR_MS); // well past both periods, closed
      stageItems([makeItem({ order: makeOrder({ deliveredAt }) })]);

      const result = await service.getEarnings({}, FROM, TO, now);

      expect(result.settlementPreview).toHaveLength(1);
      // Period 1's start (anchor + 14d), NOT period 0's start (the anchor).
      expect(result.settlementPreview[0].periodStart).toEqual(
        new Date(SETTLEMENT_ANCHOR_DATE.getTime() + 14 * 24 * HOUR_MS),
      );
      expect(result.settlementPreview[0].periodEnd).toEqual(
        new Date(SETTLEMENT_ANCHOR_DATE.getTime() + 28 * 24 * HOUR_MS),
      );
      expect(result.settlementPreview[0].orderCount).toBe(1);
    });
  });

  describe('getEarningsByVendor', () => {
    it('groups earnings by vendor without cross-vendor leakage', async () => {
      const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
      const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);
      stageItems([
        makeItem({
          id: 'v1-item',
          orderId: 'order-v1',
          order: makeOrder({ id: 'order-v1', deliveredAt }),
          vendorId: 'vendor-1',
          unitPrice: '100.00' as never,
        }),
        makeItem({
          id: 'v2-item',
          orderId: 'order-v2',
          order: makeOrder({ id: 'order-v2', deliveredAt }),
          vendorId: 'vendor-2',
          unitPrice: '200.00' as never,
        }),
      ]);

      const result = await service.getEarningsByVendor({}, FROM, TO, now);

      expect(result.size).toBe(2);
      const v1 = result.get('vendor-1');
      const v2 = result.get('vendor-2');

      expect(v1.accrued.orderCount).toBe(1);
      expect(v1.accrued.byCurrency).toEqual([
        { currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 },
      ]);
      expect(v2.accrued.byCurrency).toEqual([
        { currency: CurrencyCode.ZAR, commissionAmount: 30, netAmount: 170 },
      ]);
    });

    it('exposes both commission and net at the pendingClaimWindow bucket (getEarnings() only keeps net)', async () => {
      const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
      const now = new Date(deliveredAt.getTime() + 47 * HOUR_MS); // still inside claim window
      stageItems([makeItem({ order: makeOrder({ deliveredAt }), vendorId: 'vendor-1' })]);

      const result = await service.getEarningsByVendor({}, FROM, TO, now);
      const group = result.get('vendor-1');

      expect(group.pendingClaimWindow.orderCount).toBe(1);
      expect(group.pendingClaimWindow.byCurrency).toEqual([
        { currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 },
      ]);
      expect(group.accrued.byCurrency).toEqual([]);
      expect(group.settlementPreview).toEqual([]);
    });

    it('buckets a closed-period line into settlementPreview with both commission and net', async () => {
      const deliveredAt = new Date(SETTLEMENT_ANCHOR_DATE.getTime());
      const now = new Date(deliveredAt.getTime() + 30 * 24 * HOUR_MS); // well past, closed period
      stageItems([makeItem({ order: makeOrder({ deliveredAt }), vendorId: 'vendor-1' })]);

      const result = await service.getEarningsByVendor({}, FROM, TO, now);
      const group = result.get('vendor-1');

      expect(group.settlementPreview).toHaveLength(1);
      expect(group.settlementPreview[0].orderCount).toBe(1);
      expect(group.settlementPreview[0].byCurrency).toEqual([
        { currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 },
      ]);
      expect(group.settlementPreview[0].periodStart).toEqual(SETTLEMENT_ANCHOR_DATE);
    });

    it('counts one order once even when a vendor has multiple line items on it', async () => {
      const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
      const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);
      const order = makeOrder({ id: 'order-multi', deliveredAt });
      stageItems([
        makeItem({ id: 'item-a', orderId: 'order-multi', order, vendorId: 'vendor-1' }),
        makeItem({ id: 'item-b', orderId: 'order-multi', order, vendorId: 'vendor-1' }),
      ]);

      const result = await service.getEarningsByVendor({}, FROM, TO, now);
      const group = result.get('vendor-1');

      expect(group.accrued.orderCount).toBe(1);
      expect(group.accrued.byCurrency).toEqual([
        { currency: CurrencyCode.ZAR, commissionAmount: 30, netAmount: 170 },
      ]);
    });

    it('never combines ZAR and NAD for the same vendor', async () => {
      const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
      const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);
      stageItems([
        makeItem({
          id: 'zar-item',
          orderId: 'order-zar',
          order: makeOrder({ id: 'order-zar', deliveredAt }),
          vendorId: 'vendor-1',
          currency: CurrencyCode.ZAR,
        }),
        makeItem({
          id: 'nad-item',
          orderId: 'order-nad',
          order: makeOrder({ id: 'order-nad', deliveredAt }),
          vendorId: 'vendor-1',
          currency: CurrencyCode.NAD,
        }),
      ]);

      const result = await service.getEarningsByVendor({}, FROM, TO, now);
      const group = result.get('vendor-1');

      expect(group.accrued.byCurrency).toEqual(
        expect.arrayContaining([
          { currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 },
          { currency: CurrencyCode.NAD, commissionAmount: 15, netAmount: 85 },
        ]),
      );
    });

    it('scope.vendorId narrows the query to just that vendor', async () => {
      const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
      const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);
      stageItems([
        makeItem({
          id: 'mine',
          orderId: 'order-mine',
          order: makeOrder({ id: 'order-mine', deliveredAt }),
          vendorId: 'vendor-1',
        }),
        makeItem({
          id: 'theirs',
          orderId: 'order-theirs',
          order: makeOrder({ id: 'order-theirs', deliveredAt }),
          vendorId: 'vendor-2',
        }),
      ]);

      const result = await service.getEarningsByVendor({ vendorId: 'vendor-1' }, FROM, TO, now);

      expect(result.size).toBe(1);
      expect(result.has('vendor-2')).toBe(false);
    });

    it('excludes a cancelled order from every vendor bucket', async () => {
      const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
      const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);
      stageItems([
        makeItem({
          id: 'cancelled',
          orderId: 'order-cancelled',
          order: makeOrder({ id: 'order-cancelled', deliveredAt, status: OrderStatus.CANCELLED }),
          vendorId: 'vendor-1',
        }),
      ]);

      const result = await service.getEarningsByVendor({}, FROM, TO, now);
      expect(result.has('vendor-1')).toBe(false);
    });

    it('excludes a vendor line whose order has a refunded payment', async () => {
      const deliveredAt = new Date('2026-01-10T00:00:00.000Z');
      const now = new Date(deliveredAt.getTime() + 49 * HOUR_MS);
      stageItems([
        makeItem({
          orderId: 'order-refunded',
          order: makeOrder({ id: 'order-refunded', deliveredAt }),
          vendorId: 'vendor-1',
        }),
      ]);
      paymentRepo.find.mockResolvedValue([
        { orderId: 'order-refunded', status: PaymentStatus.REFUNDED },
      ]);

      const result = await service.getEarningsByVendor({}, FROM, TO, now);
      expect(result.has('vendor-1')).toBe(false);
    });

    it('returns an empty map when there are no vendor lines in range', async () => {
      stageItems([]);
      const result = await service.getEarningsByVendor({}, FROM, TO);
      expect(result.size).toBe(0);
    });
  });
});
