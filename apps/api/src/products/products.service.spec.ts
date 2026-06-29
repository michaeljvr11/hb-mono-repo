import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CurrencyCode, CountryCode, ListingType, VendorStatus } from '@hb/shared';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Category } from '../categories/entities/category.entity';
import { FileUrlService } from './upload/file-url.service';
import { AuditService } from '../audit/audit.service';

const NOW = new Date('2026-06-01T10:00:00.000Z');

const makeVendor = (status: VendorStatus): Vendor =>
  ({
    id: 'v1',
    businessName: 'Test Vendor Co',
    status,
  }) as Vendor;

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Test Product',
  description: 'A product description',
  price: 99.99,
  currency: CurrencyCode.ZAR,
  stockQuantity: 10,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.PLATFORM,
  images: [],
  categories: [],
  vendor: undefined,
  vendorId: undefined,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

// ── Fixture set ──────────────────────────────────────────────────────────────
const platformProduct = makeProduct({
  id: 'platform-1',
  listingType: ListingType.PLATFORM,
  vendor: undefined,
  vendorId: undefined,
});

const approvedVendorProduct = makeProduct({
  id: 'approved-1',
  listingType: ListingType.VENDOR,
  vendor: makeVendor(VendorStatus.APPROVED),
  vendorId: 'v1',
});

const pendingVendorProduct = makeProduct({
  id: 'pending-1',
  listingType: ListingType.VENDOR,
  vendor: makeVendor(VendorStatus.PENDING),
  vendorId: 'v1',
});

const rejectedVendorProduct = makeProduct({
  id: 'rejected-1',
  listingType: ListingType.VENDOR,
  vendor: makeVendor(VendorStatus.REJECTED),
  vendorId: 'v1',
});

const suspendedVendorProduct = makeProduct({
  id: 'suspended-1',
  listingType: ListingType.VENDOR,
  vendor: makeVendor(VendorStatus.SUSPENDED),
  vendorId: 'v1',
});

const ALL_PRODUCTS: Product[] = [
  platformProduct,
  approvedVendorProduct,
  pendingVendorProduct,
  rejectedVendorProduct,
  suspendedVendorProduct,
];

// ── Where-array mock helpers ──────────────────────────────────────────────────
// Products.findAll / findOne use an array-of-conditions WHERE (OR semantics):
// a product matches when ALL constraints in at least ONE condition object are met.
// Nested relation checks (e.g. { vendor: { status: 'approved' } }) compare against
// the product's loaded relation field, mirroring how TypeORM resolves joins.

function matchesWhereArray(product: Product, conditions: Record<string, unknown>[]): boolean {
  return conditions.some((condition) =>
    Object.entries(condition).every(([key, val]) => {
      if (typeof val === 'object' && val !== null) {
        const nested = product[key as keyof Product] as Record<string, unknown> | undefined;
        return Object.entries(val as Record<string, unknown>).every(
          ([nk, nv]) => nested?.[nk] === nv,
        );
      }
      return (product[key as keyof Product] as unknown) === val;
    }),
  );
}

/** Simulates `repository.find` — filters the stored list with the real WHERE logic. */
const respectsWhereFind =
  (stored: Product[]) =>
  ({ where }: { where: Record<string, unknown>[] }) =>
    Promise.resolve(stored.filter((p) => matchesWhereArray(p, where)));

/** Simulates `repository.findOne` — returns the first matching product or null. */
const respectsWhereFindOne =
  (stored: Product[]) =>
  ({ where }: { where: Record<string, unknown>[] }) =>
    Promise.resolve(stored.find((p) => matchesWhereArray(p, where)) ?? null);

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('ProductsService', () => {
  let service: ProductsService;
  let productRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    productRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findBy: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductImage), useValue: {} },
        { provide: getRepositoryToken(Vendor), useValue: {} },
        { provide: getRepositoryToken(Category), useValue: {} },
        { provide: FileUrlService, useValue: { getFileUrl: jest.fn() } },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(ProductsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('returns PLATFORM listings regardless of vendor status', async () => {
      productRepo.find.mockImplementation(respectsWhereFind([platformProduct]));

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('platform-1');
      expect(result[0].listingType).toBe(ListingType.PLATFORM);
    });

    it('returns APPROVED-vendor listings', async () => {
      productRepo.find.mockImplementation(respectsWhereFind([approvedVendorProduct]));

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('approved-1');
      expect(result[0].listingType).toBe(ListingType.VENDOR);
    });

    // The WHERE mock genuinely excludes these — it is the query's doing, not a hand-forced [].
    const nonApprovedCases: ReadonlyArray<[VendorStatus, string, Product]> = [
      [VendorStatus.PENDING, 'pending-1', pendingVendorProduct],
      [VendorStatus.REJECTED, 'rejected-1', rejectedVendorProduct],
      [VendorStatus.SUSPENDED, 'suspended-1', suspendedVendorProduct],
    ];

    it.each(nonApprovedCases)(
      'excludes a %s-vendor product from the catalogue',
      async (_status, productId, product) => {
        productRepo.find.mockImplementation(respectsWhereFind([product]));

        const result = await service.findAll();

        expect(result.map((p) => p.id)).not.toContain(productId);
      },
    );

    it('passes the exact where array-of-conditions and relations to the repository', async () => {
      productRepo.find.mockResolvedValue([]);

      await service.findAll();

      expect(productRepo.find).toHaveBeenCalledWith({
        where: [
          { listingType: ListingType.PLATFORM },
          { listingType: ListingType.VENDOR, vendor: { status: VendorStatus.APPROVED } },
        ],
        relations: ['images', 'vendor', 'categories'],
      });
    });

    it('returns an empty array when the repository is empty', async () => {
      productRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });

    it('returns only PLATFORM and APPROVED-vendor listings from a mixed fixture set', async () => {
      productRepo.find.mockImplementation(respectsWhereFind(ALL_PRODUCTS));

      const result = await service.findAll();
      const ids = result.map((p) => p.id);

      expect(ids).toContain('platform-1');
      expect(ids).toContain('approved-1');
      expect(ids).not.toContain('pending-1');
      expect(ids).not.toContain('rejected-1');
      expect(ids).not.toContain('suspended-1');
    });
  });

  describe('findOne', () => {
    it('resolves to the DTO for a PLATFORM product by id', async () => {
      productRepo.findOne.mockImplementation(respectsWhereFindOne(ALL_PRODUCTS));

      const result = await service.findOne('platform-1');

      expect(result.id).toBe('platform-1');
      expect(result.listingType).toBe(ListingType.PLATFORM);
      expect(result.vendor).toBeUndefined();
    });

    it('resolves to the DTO for an APPROVED-vendor product by id', async () => {
      productRepo.findOne.mockImplementation(respectsWhereFindOne(ALL_PRODUCTS));

      const result = await service.findOne('approved-1');

      expect(result.id).toBe('approved-1');
      expect(result.listingType).toBe(ListingType.VENDOR);
      expect(result.vendor?.id).toBe('v1');
      expect(result.vendor?.businessName).toBe('Test Vendor Co');
    });

    // The WHERE mock genuinely excludes these products — the id exists in ALL_PRODUCTS
    // but the query's OR conditions do not match, so the service throws 404.
    const nonApprovedFindOneCases: ReadonlyArray<[VendorStatus, string]> = [
      [VendorStatus.PENDING, 'pending-1'],
      [VendorStatus.REJECTED, 'rejected-1'],
      [VendorStatus.SUSPENDED, 'suspended-1'],
    ];

    it.each(nonApprovedFindOneCases)(
      'throws NotFoundException for a %s-vendor product even though the id exists',
      async (_status, productId) => {
        productRepo.findOne.mockImplementation(respectsWhereFindOne(ALL_PRODUCTS));

        await expect(service.findOne(productId)).rejects.toBeInstanceOf(NotFoundException);
      },
    );

    it('throws NotFoundException for an unknown product id', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
