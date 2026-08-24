import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CountryCode, CurrencyCode } from '@hb/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import { ProductShippingFeeOverrideService } from './product-shipping-fee-override.service';
import { ProductShippingFeeOverride } from './entities/product-shipping-fee-override.entity';
import { Product } from '../products/entities/product.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeRow = (
  overrides: Partial<ProductShippingFeeOverride> = {},
): ProductShippingFeeOverride => ({
  id: 'override-1',
  productId: 'product-1',
  originCountry: CountryCode.NAMIBIA,
  destinationCountry: CountryCode.NAMIBIA,
  currency: CurrencyCode.NAD,
  amount: '50.00' as unknown as number, // simulate the pg driver's numeric-as-string quirk
  updatedAt: new Date('2026-08-24T00:00:00.000Z'),
  updatedByUserId: 'admin-1',
  ...overrides,
});

describe('ProductShippingFeeOverrideService', () => {
  let service: ProductShippingFeeOverrideService;
  let overrideRepo: Record<string, jest.Mock>;
  let productRepo: Record<string, jest.Mock>;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    overrideRepo = {
      upsert: jest.fn().mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] }),
      findOneOrFail: jest.fn(),
      delete: jest.fn(),
      find: jest.fn(),
    };

    productRepo = {
      existsBy: jest.fn(),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        ProductShippingFeeOverrideService,
        { provide: getRepositoryToken(ProductShippingFeeOverride), useValue: overrideRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(ProductShippingFeeOverrideService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── set() ──────────────────────────────────────────────────────────────────

  describe('set()', () => {
    it('404s when the product does not exist', async () => {
      productRepo.existsBy.mockResolvedValue(false);

      await expect(
        service.set(
          'unknown-product',
          {
            originCountry: CountryCode.NAMIBIA,
            destinationCountry: CountryCode.NAMIBIA,
            currency: CurrencyCode.NAD,
            amount: 50,
          },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(overrideRepo.upsert).not.toHaveBeenCalled();
    });

    it('creates an override on the first call and upserts (replaces) on a second call for the same key', async () => {
      productRepo.existsBy.mockResolvedValue(true);
      overrideRepo.findOneOrFail.mockResolvedValue(
        makeRow({ amount: '50.00' as unknown as number }),
      );

      const first = await service.set(
        'product-1',
        {
          originCountry: CountryCode.NAMIBIA,
          destinationCountry: CountryCode.NAMIBIA,
          currency: CurrencyCode.NAD,
          amount: 50,
        },
        'admin-1',
      );

      expect(overrideRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'product-1', amount: 50 }),
        ['productId', 'originCountry', 'destinationCountry', 'currency'],
      );
      expect(first.amount).toBe(50);

      // Second call, same (product, route, currency), different amount — must replace, not append.
      overrideRepo.findOneOrFail.mockResolvedValue(
        makeRow({ amount: '75.00' as unknown as number }),
      );

      const second = await service.set(
        'product-1',
        {
          originCountry: CountryCode.NAMIBIA,
          destinationCountry: CountryCode.NAMIBIA,
          currency: CurrencyCode.NAD,
          amount: 75,
        },
        'admin-1',
      );

      expect(overrideRepo.upsert).toHaveBeenCalledTimes(2);
      expect(overrideRepo.upsert).toHaveBeenLastCalledWith(
        expect.objectContaining({ amount: 75 }),
        ['productId', 'originCountry', 'destinationCountry', 'currency'],
      );
      expect(second.amount).toBe(75);
      expect(overrideRepo.findOneOrFail).toHaveBeenCalledTimes(2);
    });

    it('audit-logs the set with the resolved row id', async () => {
      productRepo.existsBy.mockResolvedValue(true);
      overrideRepo.findOneOrFail.mockResolvedValue(makeRow());

      await service.set(
        'product-1',
        {
          originCountry: CountryCode.NAMIBIA,
          destinationCountry: CountryCode.NAMIBIA,
          currency: CurrencyCode.NAD,
          amount: 50,
        },
        'admin-1',
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: AuditAction.PRODUCT_SHIPPING_FEE_OVERRIDE_SET,
          entityType: 'product_shipping_fee_override',
          entityId: 'override-1',
        }),
      );
    });

    it('coerces amount to a number', async () => {
      productRepo.existsBy.mockResolvedValue(true);
      overrideRepo.findOneOrFail.mockResolvedValue(
        makeRow({ amount: '199.99' as unknown as number }),
      );

      const result = await service.set(
        'product-1',
        {
          originCountry: CountryCode.NAMIBIA,
          destinationCountry: CountryCode.NAMIBIA,
          currency: CurrencyCode.NAD,
          amount: 199.99,
        },
        'admin-1',
      );

      expect(result.amount).toBe(199.99);
      expect(typeof result.amount).toBe('number');
    });
  });

  // ─── clear() ────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('404s when the product does not exist', async () => {
      productRepo.existsBy.mockResolvedValue(false);

      await expect(
        service.clear(
          'unknown-product',
          {
            originCountry: CountryCode.NAMIBIA,
            destinationCountry: CountryCode.NAMIBIA,
            currency: CurrencyCode.NAD,
          },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(overrideRepo.delete).not.toHaveBeenCalled();
    });

    it('deletes the row for the exact (product, route, currency) and audit-logs it', async () => {
      productRepo.existsBy.mockResolvedValue(true);
      overrideRepo.delete.mockResolvedValue({ affected: 1 });

      await service.clear(
        'product-1',
        {
          originCountry: CountryCode.NAMIBIA,
          destinationCountry: CountryCode.NAMIBIA,
          currency: CurrencyCode.NAD,
        },
        'admin-1',
      );

      expect(overrideRepo.delete).toHaveBeenCalledWith({
        productId: 'product-1',
        originCountry: CountryCode.NAMIBIA,
        destinationCountry: CountryCode.NAMIBIA,
        currency: CurrencyCode.NAD,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.PRODUCT_SHIPPING_FEE_OVERRIDE_CLEARED }),
      );
    });

    it('is a no-op (no audit log) when nothing matched the (route, currency)', async () => {
      productRepo.existsBy.mockResolvedValue(true);
      overrideRepo.delete.mockResolvedValue({ affected: 0 });

      await service.clear(
        'product-1',
        {
          originCountry: CountryCode.NAMIBIA,
          destinationCountry: CountryCode.NAMIBIA,
          currency: CurrencyCode.NAD,
        },
        'admin-1',
      );

      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('after clearing, the bulk lookup returns nothing for that combination', async () => {
      productRepo.existsBy.mockResolvedValue(true);
      overrideRepo.delete.mockResolvedValue({ affected: 1 });
      await service.clear(
        'product-1',
        {
          originCountry: CountryCode.NAMIBIA,
          destinationCountry: CountryCode.NAMIBIA,
          currency: CurrencyCode.NAD,
        },
        'admin-1',
      );

      // The cleared combination no longer resolves via the repo (simulated: find returns []).
      overrideRepo.find.mockResolvedValue([]);
      const amounts = await service.findOverrideAmounts(
        ['product-1'],
        CountryCode.NAMIBIA,
        CountryCode.NAMIBIA,
        CurrencyCode.NAD,
      );

      expect(amounts.has('product-1')).toBe(false);
    });
  });

  // ─── findOverrideAmounts() — bulk lookup for SF-3 ──────────────────────────

  describe('findOverrideAmounts()', () => {
    it('returns an empty map without querying when given no productIds', async () => {
      const result = await service.findOverrideAmounts(
        [],
        CountryCode.NAMIBIA,
        CountryCode.NAMIBIA,
        CurrencyCode.NAD,
      );

      expect(result.size).toBe(0);
      expect(overrideRepo.find).not.toHaveBeenCalled();
    });

    it('returns a per-product mapping for a mixed set of overridden and non-overridden products in one query', async () => {
      overrideRepo.find.mockResolvedValue([
        makeRow({ productId: 'product-1', amount: '50.00' as unknown as number }),
        makeRow({ productId: 'product-3', amount: '20.00' as unknown as number }),
      ]);

      const result = await service.findOverrideAmounts(
        ['product-1', 'product-2', 'product-3'],
        CountryCode.NAMIBIA,
        CountryCode.NAMIBIA,
        CurrencyCode.NAD,
      );

      expect(overrideRepo.find).toHaveBeenCalledTimes(1);
      expect(result.get('product-1')).toBe(50);
      expect(result.has('product-2')).toBe(false);
      expect(result.get('product-3')).toBe(20);
    });

    it('resolves partial coverage correctly: a NA->NA/NAD override never answers a ZA->NA/NAD lookup', async () => {
      // Simulate a repo that actually enforces the where clause: only the
      // exact (route, currency) queried is ever matched.
      overrideRepo.find.mockImplementation(
        (opts: {
          where: {
            originCountry: CountryCode;
            destinationCountry: CountryCode;
            currency: CurrencyCode;
          };
        }) => {
          const { originCountry, destinationCountry, currency } = opts.where;
          if (
            originCountry === CountryCode.NAMIBIA &&
            destinationCountry === CountryCode.NAMIBIA &&
            currency === CurrencyCode.NAD
          ) {
            return Promise.resolve([
              makeRow({
                productId: 'product-1',
                originCountry: CountryCode.NAMIBIA,
                destinationCountry: CountryCode.NAMIBIA,
                currency: CurrencyCode.NAD,
                amount: '30.00' as unknown as number,
              }),
            ]);
          }
          return Promise.resolve([]);
        },
      );

      const covered = await service.findOverrideAmounts(
        ['product-1'],
        CountryCode.NAMIBIA,
        CountryCode.NAMIBIA,
        CurrencyCode.NAD,
      );
      expect(covered.get('product-1')).toBe(30);

      // Same product, ZA->NA/NAD (never configured) — must fall through with nothing,
      // so SF-3 falls back to the global default instead of leaking the NA->NA amount.
      const uncovered = await service.findOverrideAmounts(
        ['product-1'],
        CountryCode.SOUTH_AFRICA,
        CountryCode.NAMIBIA,
        CurrencyCode.NAD,
      );
      expect(uncovered.has('product-1')).toBe(false);

      // Same route, other currency (ZAR) — also never configured — must not leak either.
      const otherCurrency = await service.findOverrideAmounts(
        ['product-1'],
        CountryCode.NAMIBIA,
        CountryCode.NAMIBIA,
        CurrencyCode.ZAR,
      );
      expect(otherCurrency.has('product-1')).toBe(false);
    });
  });

  // ─── listForProduct() ───────────────────────────────────────────────────────

  describe('listForProduct()', () => {
    it('404s when the product does not exist', async () => {
      productRepo.existsBy.mockResolvedValue(false);

      await expect(service.listForProduct('unknown-product')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns whatever overrides exist, coercing amounts to numbers', async () => {
      productRepo.existsBy.mockResolvedValue(true);
      overrideRepo.find.mockResolvedValue([makeRow({ amount: '30.00' as unknown as number })]);

      const result = await service.listForProduct('product-1');

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(30);
      expect(typeof result[0].amount).toBe('number');
    });
  });
});
