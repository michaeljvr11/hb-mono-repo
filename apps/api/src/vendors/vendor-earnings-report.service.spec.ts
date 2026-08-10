import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CurrencyCode } from '@hb/shared';
import { VendorEarningsReportService } from './vendor-earnings-report.service';
import { Vendor } from './entities/vendor.entity';
import { VendorEarningsGroup, VendorEarningsService } from '../earnings/vendor-earnings.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 'vendor-1',
    userId: 'user-1',
    businessName: 'Acme Co',
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

const NOW = new Date('2026-08-10T12:00:00.000Z');

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('VendorEarningsReportService', () => {
  let service: VendorEarningsReportService;
  let vendorRepo: Record<string, jest.Mock>;
  let vendorEarningsService: { getEarningsByVendor: jest.Mock };

  beforeEach(async () => {
    vendorRepo = { findOne: jest.fn() };
    vendorEarningsService = { getEarningsByVendor: jest.fn().mockResolvedValue(new Map()) };

    const module = await Test.createTestingModule({
      providers: [
        VendorEarningsReportService,
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
        { provide: VendorEarningsService, useValue: vendorEarningsService },
      ],
    }).compile();

    service = module.get(VendorEarningsReportService);
  });

  it('throws NotFoundException when the authenticated user has no vendor profile', async () => {
    vendorRepo.findOne.mockResolvedValue(null);

    await expect(service.getMyEarnings('user-x', {}, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(vendorEarningsService.getEarningsByVendor).not.toHaveBeenCalled();
  });

  it('resolves the vendor scope from userId ONLY (never client-supplied) and never leaks another vendor', async () => {
    vendorRepo.findOne.mockResolvedValue(makeVendor({ id: 'vendor-A', userId: 'user-A' }));
    vendorEarningsService.getEarningsByVendor.mockResolvedValue(
      new Map([
        ['vendor-A', makeGroup({ vendorId: 'vendor-A' })],
        [
          'vendor-B',
          makeGroup({
            vendorId: 'vendor-B',
            accrued: {
              orderCount: 99,
              byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 999, netAmount: 999 }],
            },
          }),
        ],
      ]),
    );

    const result = await service.getMyEarnings('user-A', {}, NOW);

    expect(vendorRepo.findOne).toHaveBeenCalledWith({ where: { userId: 'user-A' } });
    // The real bind params passed downstream — scoped to vendor-A only.
    expect(vendorEarningsService.getEarningsByVendor).toHaveBeenCalledWith(
      { vendorId: 'vendor-A' },
      expect.any(Date),
      expect.any(Date),
      NOW,
    );
    expect(result.summary.vendorId).toBe('vendor-A');
    expect(result.summary.orderCount).toBe(0); // never picks up vendor-B's activity
    expect(result.summary.grossByCurrency).toEqual([]);
  });

  it('a vendor with zero eligible activity returns an all-zero result, with one open settlementPreview entry at zero', async () => {
    vendorRepo.findOne.mockResolvedValue(makeVendor());
    vendorEarningsService.getEarningsByVendor.mockResolvedValue(new Map()); // no key for vendor-1

    const result = await service.getMyEarnings('user-1', {}, NOW);

    expect(result.summary).toEqual({
      vendorId: 'vendor-1',
      businessName: 'Acme Co',
      orderCount: 0,
      grossByCurrency: [],
      commissionByCurrency: [],
      netByCurrency: [],
    });
    expect(result.balance).toEqual({
      pendingClaimWindowByCurrency: [],
      accruedByCurrency: [],
    });
    expect(result.settlementPreview).toHaveLength(1);
    expect(result.settlementPreview[0]).toMatchObject({
      orderCount: 0,
      netByCurrency: [],
      status: 'open',
    });
  });

  it('balance splits pendingClaimWindow vs accrued net amounts, dropping commission (net-only)', async () => {
    vendorRepo.findOne.mockResolvedValue(makeVendor());
    vendorEarningsService.getEarningsByVendor.mockResolvedValue(
      new Map([
        [
          'vendor-1',
          makeGroup({
            pendingClaimWindow: {
              orderCount: 1,
              byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 }],
            },
            accrued: {
              orderCount: 2,
              byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 30, netAmount: 170 }],
            },
          }),
        ],
      ]),
    );

    const result = await service.getMyEarnings('user-1', {}, NOW);

    expect(result.balance.pendingClaimWindowByCurrency).toEqual([
      { currency: CurrencyCode.ZAR, amount: 85 },
    ]);
    expect(result.balance.accruedByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 170 }]);
  });

  it('summary.grossByCurrency always equals commission + net per currency — derived identity, not hardcoded', async () => {
    vendorRepo.findOne.mockResolvedValue(makeVendor());
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
                periodStart: new Date('2026-07-01T00:00:00.000Z'),
                periodEnd: new Date('2026-07-15T00:00:00.000Z'),
                orderCount: 3,
                byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 45, netAmount: 255 }],
              },
            ],
          }),
        ],
      ]),
    );

    const result = await service.getMyEarnings('user-1', {}, NOW);

    expect(result.summary.orderCount).toBe(4); // 1 accrued + 3 settled
    for (const gross of result.summary.grossByCurrency) {
      const commission = result.summary.commissionByCurrency.find(
        (c) => c.currency === gross.currency,
      );
      const net = result.summary.netByCurrency.find((c) => c.currency === gross.currency);
      expect(gross.amount).toBe(
        Math.round(((commission?.amount ?? 0) + (net?.amount ?? 0)) * 100) / 100,
      );
    }
    expect(result.summary.grossByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 400 }]);
  });

  it('excludes pendingClaimWindow entirely from summary (eligible-lines-only, mirrors VE-4)', async () => {
    vendorRepo.findOne.mockResolvedValue(makeVendor());
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

    const result = await service.getMyEarnings('user-1', {}, NOW);

    expect(result.summary.orderCount).toBe(0);
    expect(result.summary.grossByCurrency).toEqual([]);
    expect(result.summary.commissionByCurrency).toEqual([]);
    expect(result.summary.netByCurrency).toEqual([]);
  });

  it('settlementPreview: closed periods carry status "closed", exactly one appended "open" entry sourced from accrued', async () => {
    vendorRepo.findOne.mockResolvedValue(makeVendor());
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
                periodStart: new Date('2026-06-01T00:00:00.000Z'),
                periodEnd: new Date('2026-06-15T00:00:00.000Z'),
                orderCount: 1,
                byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 10, netAmount: 90 }],
              },
              {
                periodStart: new Date('2026-06-15T00:00:00.000Z'),
                periodEnd: new Date('2026-06-29T00:00:00.000Z'),
                orderCount: 1,
                byCurrency: [{ currency: CurrencyCode.ZAR, commissionAmount: 10, netAmount: 90 }],
              },
            ],
          }),
        ],
      ]),
    );

    const result = await service.getMyEarnings('user-1', {}, NOW);

    const closed = result.settlementPreview.filter((p) => p.status === 'closed');
    const open = result.settlementPreview.filter((p) => p.status === 'open');
    expect(closed).toHaveLength(2);
    expect(open).toHaveLength(1);
    expect(open[0].orderCount).toBe(1);
    expect(open[0].netByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 85 }]);
    // Closed periods carry net only (no commission field leaked).
    expect(closed[0].netByCurrency).toEqual([{ currency: CurrencyCode.ZAR, amount: 90 }]);
  });

  it('keeps ZAR and NAD separate throughout balance/summary/settlementPreview — never summed', async () => {
    vendorRepo.findOne.mockResolvedValue(makeVendor());
    vendorEarningsService.getEarningsByVendor.mockResolvedValue(
      new Map([
        [
          'vendor-1',
          makeGroup({
            pendingClaimWindow: {
              orderCount: 1,
              byCurrency: [
                { currency: CurrencyCode.ZAR, commissionAmount: 15, netAmount: 85 },
                { currency: CurrencyCode.NAD, commissionAmount: 15, netAmount: 85 },
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

    const result = await service.getMyEarnings('user-1', {}, NOW);

    expect(result.balance.pendingClaimWindowByCurrency).toEqual(
      expect.arrayContaining([
        { currency: CurrencyCode.ZAR, amount: 85 },
        { currency: CurrencyCode.NAD, amount: 85 },
      ]),
    );
    expect(result.balance.pendingClaimWindowByCurrency).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ amount: 170 })]),
    );
    expect(result.summary.grossByCurrency).toEqual(
      expect.arrayContaining([
        { currency: CurrencyCode.ZAR, amount: 100 },
        { currency: CurrencyCode.NAD, amount: 100 },
      ]),
    );
    expect(result.settlementPreview.find((p) => p.status === 'open')?.netByCurrency).toEqual(
      expect.arrayContaining([
        { currency: CurrencyCode.ZAR, amount: 85 },
        { currency: CurrencyCode.NAD, amount: 85 },
      ]),
    );
  });

  it('explicit from/to overrides the window preset via resolveEarningsWindow', async () => {
    vendorRepo.findOne.mockResolvedValue(makeVendor());

    const result = await service.getMyEarnings(
      'user-1',
      { window: '1w', from: '2026-01-01', to: '2026-01-31' },
      NOW,
    );

    expect(result.from).toBe(new Date('2026-01-01T00:00:00.000Z').toISOString());
    expect(result.to).toBe(new Date('2026-01-31T23:59:59.999Z').toISOString());
    expect(vendorEarningsService.getEarningsByVendor).toHaveBeenCalledWith(
      { vendorId: 'vendor-1' },
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-31T23:59:59.999Z'),
      NOW,
    );
  });

  it('defaults to the current UTC calendar month (1m) when neither window nor from/to are supplied', async () => {
    vendorRepo.findOne.mockResolvedValue(makeVendor());

    const result = await service.getMyEarnings('user-1', {}, NOW);

    const expectedFrom = new Date(Date.UTC(2026, 7, 1, 0, 0, 0, 0)); // Aug 1 2026 UTC
    expect(result.from).toBe(expectedFrom.toISOString());
    expect(result.to).toBe(NOW.toISOString());
    expect(vendorEarningsService.getEarningsByVendor).toHaveBeenCalledWith(
      { vendorId: 'vendor-1' },
      expectedFrom,
      NOW,
      NOW,
    );
  });
});
