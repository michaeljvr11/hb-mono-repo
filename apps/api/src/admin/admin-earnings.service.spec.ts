import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CurrencyCode, ListingType, OrderStatus, VendorStatus } from '@hb/shared';
import { AdminEarningsService } from './admin-earnings.service';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { VendorEarningsGroup, VendorEarningsService } from '../earnings/vendor-earnings.service';
import { ALL_TIME_START } from '../common/utils/earnings-window.utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 'vendor-1',
    businessName: 'Acme Co',
    status: VendorStatus.APPROVED,
    ...overrides,
  } as Vendor;
}

function makeGroup(overrides: Partial<VendorEarningsGroup> = {}): VendorEarningsGroup {
  return {
    vendorId: 'vendor-1',
    pendingClaimWindow: { orderCount: 0, byCurrency: [] },
    accrued: { orderCount: 0, byCurrency: [] },
    settlementPreview: [],
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    status: OrderStatus.DELIVERED,
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    ...overrides,
  } as Order;
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  const order = overrides.order ?? makeOrder();
  return {
    id: 'item-1',
    orderId: order.id,
    order,
    productName: 'Platform Widget',
    unitPrice: '100.00' as never,
    currency: CurrencyCode.ZAR,
    quantity: 1,
    listingType: ListingType.PLATFORM,
    ...overrides,
  } as OrderItem;
}

/**
 * Simulates a real WHERE-clause-filtered TypeORM query builder (same
 * convention as `VendorEarningsService`'s spec): captures EVERY bind param
 * the real query passes (`platform`, `cancelled`, `from`/`to`, `vendorId`)
 * from both `where` and `andWhere`, and filters `getMany()`'s results off
 * those captured values — never off a hardcoded re-implementation of the
 * filter. Dropping any `.where()`/`.andWhere()` clause from the real query
 * (`admin-earnings.service.ts`'s `getPlatformListingGmv`) leaves the
 * corresponding filter uncaptured and the tests below red.
 */
function makeItemsQb(allItems: OrderItem[]) {
  let vendorIdFilter: string | undefined;
  let vendorFilterApplied = false;
  let platformFilter: ListingType | undefined;
  let cancelledFilter: OrderStatus | undefined;
  let fromFilter: Date | undefined;
  let toFilter: Date | undefined;

  const capture = (params?: Record<string, unknown>) => {
    if (!params) return;
    if ('vendorId' in params) {
      vendorIdFilter = params.vendorId as string;
      vendorFilterApplied = true;
    }
    if ('platform' in params) {
      platformFilter = params.platform as ListingType;
    }
    if ('cancelled' in params) {
      cancelledFilter = params.cancelled as OrderStatus;
    }
    if ('from' in params) {
      fromFilter = params.from as Date;
    }
    if ('to' in params) {
      toFilter = params.to as Date;
    }
  };

  const qb: Record<string, jest.Mock> = {
    leftJoin: jest.fn(() => qb),
    where: jest.fn((_cond: string, params?: Record<string, unknown>) => {
      capture(params);
      return qb;
    }),
    andWhere: jest.fn((_cond: string, params?: Record<string, unknown>) => {
      capture(params);
      return qb;
    }),
    getMany: jest.fn(() =>
      Promise.resolve(
        allItems.filter((item) => {
          if (vendorFilterApplied && item.vendorId !== vendorIdFilter) return false;
          if (platformFilter !== undefined && item.listingType !== platformFilter) return false;
          if (cancelledFilter !== undefined && item.order?.status === cancelledFilter) return false;
          if (fromFilter && (!item.order || item.order.createdAt < fromFilter)) return false;
          if (toFilter && (!item.order || item.order.createdAt > toFilter)) return false;
          return true;
        }),
      ),
    ),
  };
  return qb;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AdminEarningsService', () => {
  let service: AdminEarningsService;
  let vendorRepo: Record<string, jest.Mock>;
  let orderItemRepo: Record<string, jest.Mock>;
  let vendorEarningsService: { getEarningsByVendor: jest.Mock };

  function stagePlatformItems(items: OrderItem[]) {
    orderItemRepo.createQueryBuilder.mockReturnValue(makeItemsQb(items));
  }

  beforeEach(async () => {
    vendorRepo = { find: jest.fn().mockResolvedValue([]) };
    orderItemRepo = { createQueryBuilder: jest.fn() };
    stagePlatformItems([]);
    vendorEarningsService = { getEarningsByVendor: jest.fn().mockResolvedValue(new Map()) };

    const module = await Test.createTestingModule({
      providers: [
        AdminEarningsService,
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
        { provide: VendorEarningsService, useValue: vendorEarningsService },
      ],
    }).compile();

    service = module.get(AdminEarningsService);
  });

  const QUERY = { from: '2026-01-01', to: '2026-01-31' };

  it('returns zeros/empty arrays (never nulls/undefined) when there is no data at all', async () => {
    const result = await service.getReport(QUERY);

    expect(result.vendors).toEqual([]);
    expect(result.platformCommissionByCurrency).toEqual([]);
    expect(result.platformListingGmvByCurrency).toEqual([]);
    expect(result.heldForVendorsByCurrency).toEqual([]);
    expect(result.from).toBe(new Date('2026-01-01T00:00:00.000Z').toISOString());
    expect(result.to).toBe(new Date('2026-01-31T23:59:59.999Z').toISOString());
  });

  it('a zero-earning approved vendor still appears in vendors[] with orderCount 0 and empty arrays', async () => {
    vendorRepo.find.mockResolvedValue([makeVendor({ id: 'vendor-1', businessName: 'Quiet Co' })]);
    vendorEarningsService.getEarningsByVendor.mockResolvedValue(new Map());

    const result = await service.getReport(QUERY);

    expect(result.vendors).toEqual([
      {
        vendorId: 'vendor-1',
        businessName: 'Quiet Co',
        orderCount: 0,
        grossByCurrency: [],
        commissionByCurrency: [],
        netByCurrency: [],
      },
    ]);
  });

  it('builds a vendor row from accrued + settlementPreview, deriving grossByCurrency as commission + net', async () => {
    vendorRepo.find.mockResolvedValue([makeVendor({ id: 'vendor-1' })]);
    vendorEarningsService.getEarningsByVendor.mockResolvedValue(
      new Map([
        [
          'vendor-1',
          makeGroup({
            accrued: {
              orderCount: 1,
              byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 }],
            },
            settlementPreview: [
              {
                periodStart: new Date('2026-01-01T00:00:00.000Z'),
                periodEnd: new Date('2026-01-15T00:00:00.000Z'),
                orderCount: 2,
                byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 30, netAmount: 170 }],
              },
            ],
          }),
        ],
      ]),
    );

    const result = await service.getReport(QUERY);

    expect(result.vendors).toEqual([
      {
        vendorId: 'vendor-1',
        businessName: 'Acme Co',
        orderCount: 3, // 1 (accrued) + 2 (settlementPreview)
        grossByCurrency: [{ currency: CurrencyCode.ZAR, amount: 300 }], // 45 commission + 255 net
        commissionByCurrency: [{ currency: CurrencyCode.ZAR, amount: 45 }],
        netByCurrency: [{ currency: CurrencyCode.ZAR, amount: 255 }],
      },
    ]);
  });

  it('excludes pendingClaimWindow entirely from the per-vendor row (eligible lines only)', async () => {
    vendorRepo.find.mockResolvedValue([makeVendor({ id: 'vendor-1' })]);
    vendorEarningsService.getEarningsByVendor.mockResolvedValue(
      new Map([
        [
          'vendor-1',
          makeGroup({
            pendingClaimWindow: {
              orderCount: 5,
              byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 500, netAmount: 2500 }],
            },
          }),
        ],
      ]),
    );

    const result = await service.getReport(QUERY);

    expect(result.vendors[0].orderCount).toBe(0);
    expect(result.vendors[0].grossByCurrency).toEqual([]);
    expect(result.vendors[0].commissionByCurrency).toEqual([]);
    expect(result.vendors[0].netByCurrency).toEqual([]);
  });

  it('cross-vendor totals reconcile: gross === commission + net per currency, per vendor and platform-wide', async () => {
    vendorRepo.find.mockResolvedValue([
      makeVendor({ id: 'vendor-1', businessName: 'A' }),
      makeVendor({ id: 'vendor-2', businessName: 'B' }),
    ]);
    vendorEarningsService.getEarningsByVendor.mockResolvedValue(
      new Map([
        [
          'vendor-1',
          makeGroup({
            accrued: {
              orderCount: 1,
              byCurrency: [
                { currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 },
                { currency: CurrencyCode.NAD, commissionAmount: 7.5, netAmount: 42.5 },
              ],
            },
          }),
        ],
        [
          'vendor-2',
          makeGroup({
            vendorId: 'vendor-2',
            settlementPreview: [
              {
                periodStart: new Date('2026-01-01T00:00:00.000Z'),
                periodEnd: new Date('2026-01-15T00:00:00.000Z'),
                orderCount: 1,
                byCurrency: [
                  { currency: CurrencyCode.ZAR, commissionAmount: 20, netAmount: 113.33 },
                ],
              },
            ],
          }),
        ],
      ]),
    );

    const result = await service.getReport(QUERY);

    for (const vendor of result.vendors) {
      for (const gross of vendor.grossByCurrency) {
        const commission = vendor.commissionByCurrency.find((c) => c.currency === gross.currency);
        const net = vendor.netByCurrency.find((c) => c.currency === gross.currency);
        expect(Math.round(((commission?.amount ?? 0) + (net?.amount ?? 0)) * 100) / 100).toBe(
          gross.amount,
        );
      }
    }

    // Intentional internal-consistency property: platformCommissionByCurrency
    // equals Σ per-vendor commissionByCurrency in the common case (every
    // vendor with activity is also in `vendors[]`).
    const zarPlatformCommission = result.platformCommissionByCurrency.find(
      (c) => c.currency === CurrencyCode.ZAR,
    )?.amount;
    const zarVendorCommissionSum = result.vendors.reduce(
      (sum, v) =>
        sum + (v.commissionByCurrency.find((c) => c.currency === CurrencyCode.ZAR)?.amount ?? 0),
      0,
    );
    expect(zarPlatformCommission).toBe(Math.round(zarVendorCommissionSum * 100) / 100);
  });

  it('never sums ZAR and NAD together anywhere in the report', async () => {
    vendorRepo.find.mockResolvedValue([makeVendor({ id: 'vendor-1' })]);
    vendorEarningsService.getEarningsByVendor.mockResolvedValue(
      new Map([
        [
          'vendor-1',
          makeGroup({
            accrued: {
              orderCount: 2,
              byCurrency: [
                { currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 },
                { currency: CurrencyCode.NAD, commissionAmount: 15, netAmount: 85 },
              ],
            },
          }),
        ],
      ]),
    );

    const result = await service.getReport(QUERY);

    expect(result.vendors[0].grossByCurrency).toEqual(
      expect.arrayContaining([
        { currency: CurrencyCode.ZAR, amount: 100 },
        { currency: CurrencyCode.NAD, amount: 100 },
      ]),
    );
    expect(result.vendors[0].grossByCurrency).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ amount: 200 })]),
    );
  });

  it('heldForVendorsByCurrency is exactly the accrued-bucket net total (not accrued + settlementPreview)', async () => {
    vendorRepo.find.mockResolvedValue([makeVendor({ id: 'vendor-1' })]);
    vendorEarningsService.getEarningsByVendor.mockResolvedValue(
      new Map([
        [
          'vendor-1',
          makeGroup({
            accrued: {
              orderCount: 1,
              byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 }],
            },
            settlementPreview: [
              {
                periodStart: new Date('2026-01-01T00:00:00.000Z'),
                periodEnd: new Date('2026-01-15T00:00:00.000Z'),
                orderCount: 1,
                byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 }],
              },
            ],
          }),
        ],
      ]),
    );

    const result = await service.getReport(QUERY);

    // Only the accrued net (85), not accrued + settlementPreview net (170).
    expect(result.heldForVendorsByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 85 }]);
  });

  it('platformCommissionByCurrency counts a vendor with activity even when absent from the currently-APPROVED vendors[] list', async () => {
    // Empty approved-vendor list — e.g. the vendor was suspended after the
    // window's orders were placed. Their historical commission is still real
    // platform revenue.
    vendorRepo.find.mockResolvedValue([]);
    vendorEarningsService.getEarningsByVendor.mockResolvedValue(
      new Map([
        [
          'vendor-now-suspended',
          makeGroup({
            vendorId: 'vendor-now-suspended',
            accrued: {
              orderCount: 1,
              byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 }],
            },
          }),
        ],
      ]),
    );

    const result = await service.getReport(QUERY);

    expect(result.vendors).toEqual([]);
    expect(result.platformCommissionByCurrency).toEqual([
      { currency: CurrencyCode.ZAR, amount: 15 },
    ]);
  });

  it('platformListingGmvByCurrency sums gross line GMV (unitPrice * quantity) of PLATFORM lines, excluding cancelled orders', async () => {
    stagePlatformItems([
      makeItem({ id: 'p1', unitPrice: '25.00' as never, quantity: 3 }), // 75
      makeItem({
        id: 'p2',
        unitPrice: '999.00' as never,
        order: makeOrder({ id: 'order-cancelled', status: OrderStatus.CANCELLED }),
      }),
    ]);

    const result = await service.getReport(QUERY);

    expect(result.platformListingGmvByCurrency).toEqual([
      { currency: CurrencyCode.ZAR, amount: 75 },
    ]);
  });

  it('platformListingGmvByCurrency excludes VENDOR-listing lines even when staged alongside PLATFORM lines', async () => {
    stagePlatformItems([
      makeItem({ id: 'p1', unitPrice: '25.00' as never, quantity: 1 }), // 25, PLATFORM
      makeItem({
        id: 'v1',
        unitPrice: '500.00' as never,
        quantity: 1,
        listingType: ListingType.VENDOR,
        vendorId: 'vendor-1',
      }),
    ]);

    const result = await service.getReport(QUERY);

    expect(result.platformListingGmvByCurrency).toEqual([
      { currency: CurrencyCode.ZAR, amount: 25 },
    ]);
  });

  it('platformListingGmvByCurrency is NOT delivered-gated — a PENDING platform order still counts (GMV, not revenue)', async () => {
    stagePlatformItems([
      makeItem({
        id: 'p1',
        unitPrice: '40.00' as never,
        quantity: 1,
        order: makeOrder({ id: 'order-pending', status: OrderStatus.PENDING }),
      }),
    ]);

    const result = await service.getReport(QUERY);

    expect(result.platformListingGmvByCurrency).toEqual([
      { currency: CurrencyCode.ZAR, amount: 40 },
    ]);
  });

  it('vendorId filter scopes vendors[] to just that vendor and passes the same scope down to VendorEarningsService', async () => {
    // Mirrors a real WHERE-clause-filtered repository: `where.id`, when
    // present, actually narrows the candidate set — not just asserted on
    // call args.
    vendorRepo.find.mockImplementation((args: { where: { status: VendorStatus; id?: string } }) => {
      const allVendors = [
        makeVendor({ id: 'vendor-1', businessName: 'A' }),
        makeVendor({ id: 'vendor-2', businessName: 'B' }),
      ];
      return Promise.resolve(
        allVendors.filter(
          (v) => v.status === args.where.status && (!args.where.id || v.id === args.where.id),
        ),
      );
    });

    const result = await service.getReport({ ...QUERY, vendorId: 'vendor-1' });

    expect(result.vendors).toHaveLength(1);
    expect(result.vendors[0].vendorId).toBe('vendor-1');
    expect(vendorEarningsService.getEarningsByVendor).toHaveBeenCalledWith(
      { vendorId: 'vendor-1' },
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('vendorId filter yields empty platformListingGmvByCurrency — platform lines never carry a vendorId', async () => {
    stagePlatformItems([makeItem({ id: 'p1', unitPrice: '25.00' as never, quantity: 3 })]);

    const result = await service.getReport({ ...QUERY, vendorId: 'vendor-1' });

    expect(result.platformListingGmvByCurrency).toEqual([]);
  });

  describe("window: 'all'", () => {
    it('resolves `from` to the ALL_TIME_START sentinel and returns empty (not null) arrays with zero data', async () => {
      const result = await service.getReport({ window: 'all' });

      expect(result.from).toBe(ALL_TIME_START.toISOString());
      expect(result.vendors).toEqual([]);
      expect(result.platformCommissionByCurrency).toEqual([]);
      expect(result.platformListingGmvByCurrency).toEqual([]);
      expect(result.heldForVendorsByCurrency).toEqual([]);
    });

    it('still excludes pendingClaimWindow from the per-vendor row and keeps ZAR/NAD separate — widening the range never relaxes the accounting rules', async () => {
      vendorRepo.find.mockResolvedValue([makeVendor({ id: 'vendor-1' })]);
      vendorEarningsService.getEarningsByVendor.mockResolvedValue(
        new Map([
          [
            'vendor-1',
            makeGroup({
              pendingClaimWindow: {
                orderCount: 5,
                byCurrency: [
                  { currency: CurrencyCode.ZAR, commissionAmount: 500, netAmount: 2500 },
                ],
              },
              accrued: {
                orderCount: 1,
                byCurrency: [
                  { currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 },
                  { currency: CurrencyCode.NAD, commissionAmount: 15, netAmount: 85 },
                ],
              },
            }),
          ],
        ]),
      );

      const result = await service.getReport({ window: 'all' });

      // pendingClaimWindow's 5 orders/R2500 never leak into the eligible row.
      expect(result.vendors[0].orderCount).toBe(1);
      expect(result.vendors[0].netByCurrency).toEqual(
        expect.arrayContaining([
          { currency: CurrencyCode.ZAR, amount: 85 },
          { currency: CurrencyCode.NAD, amount: 85 },
        ]),
      );
      expect(result.vendors[0].netByCurrency).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ amount: 170 })]),
      );
    });
  });
});
