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

const makeCategory = (id: string, name = `Category ${id}`): Category => ({ id, name }) as Category;

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

// ── Discovery fixtures (categoryId / q / vendorId) ───────────────────────────
const gadgetsCategory = makeCategory('cat-gadgets', 'Gadgets');
const homewareCategory = makeCategory('cat-homeware', 'Homeware');

const platformGadget = makeProduct({
  id: 'platform-gadget',
  name: 'Solar Charger',
  description: 'A portable solar-powered charger',
  listingType: ListingType.PLATFORM,
  vendor: undefined,
  vendorId: undefined,
  categories: [gadgetsCategory],
});

const approvedGadget = makeProduct({
  id: 'approved-gadget',
  name: 'Bluetooth Speaker',
  description: 'Loud portable speaker',
  listingType: ListingType.VENDOR,
  vendor: makeVendor(VendorStatus.APPROVED),
  vendorId: 'v1',
  categories: [gadgetsCategory],
});

const approvedHomeware = makeProduct({
  id: 'approved-homeware',
  name: 'Ceramic Mug',
  description: 'Hand-glazed mug',
  listingType: ListingType.VENDOR,
  vendor: makeVendor(VendorStatus.APPROVED),
  vendorId: 'v1',
  categories: [homewareCategory],
});

const pendingGadget = makeProduct({
  id: 'pending-gadget',
  name: 'Smart Charger',
  description: 'A charger from a pending vendor',
  listingType: ListingType.VENDOR,
  vendor: makeVendor(VendorStatus.PENDING),
  vendorId: 'v2',
  categories: [gadgetsCategory],
});

const DISCOVERY_PRODUCTS: Product[] = [
  platformGadget,
  approvedGadget,
  approvedHomeware,
  pendingGadget,
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

/** Simulates `repository.findOne` — returns the first matching product or null. */
const respectsWhereFindOne =
  (stored: Product[]) =>
  ({ where }: { where: Record<string, unknown>[] }) =>
    Promise.resolve(stored.find((p) => matchesWhereArray(p, where)) ?? null);

// ── QueryBuilder mock for findAll ─────────────────────────────────────────────
// findAll composes predicates via createQueryBuilder().where()/.andWhere(). This
// fake QueryBuilder accumulates the same predicates the real service issues and
// applies them for real against the fixture set — so a passing test reflects the
// actual composed query, not a hand-forced result.
type Predicate = (p: Product) => boolean;

interface FakeQueryBuilder {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  getMany: jest.Mock;
}

function interpretPredicate(sql: string, params?: Record<string, unknown>): Predicate {
  if (sql.includes('vendor.status = :approvedStatus') && sql.includes('platformType')) {
    return (p) =>
      p.listingType === ListingType.PLATFORM ||
      (p.listingType === ListingType.VENDOR && p.vendor?.status === VendorStatus.APPROVED);
  }
  if (sql.includes('product_categories')) {
    const categoryId = params?.categoryId as string;
    return (p) => (p.categories ?? []).some((c) => c.id === categoryId);
  }
  if (sql.includes('ILIKE :q')) {
    const q = ((params?.q as string) ?? '').replace(/%/g, '').toLowerCase();
    return (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
  }
  if (sql.includes('product.vendorId = :vendorId')) {
    const vendorId = params?.vendorId as string;
    return (p) => p.vendorId === vendorId;
  }
  throw new Error(`Unrecognised predicate in test fake: ${sql}`);
}

function buildFakeQueryBuilder(stored: Product[]): FakeQueryBuilder {
  const predicates: Predicate[] = [];

  const qb: FakeQueryBuilder = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    getMany: jest.fn(),
  };

  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.where.mockImplementation((sql: string, params?: Record<string, unknown>) => {
    predicates.push(interpretPredicate(sql, params));
    return qb;
  });
  qb.andWhere.mockImplementation((sql: string, params?: Record<string, unknown>) => {
    predicates.push(interpretPredicate(sql, params));
    return qb;
  });
  qb.getMany.mockImplementation(() =>
    Promise.resolve(stored.filter((p) => predicates.every((pred) => pred(p)))),
  );

  return qb;
}

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
      createQueryBuilder: jest.fn(),
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
    function mockQb(stored: Product[]) {
      const qb = buildFakeQueryBuilder(stored);
      productRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    }

    it('returns PLATFORM listings regardless of vendor status', async () => {
      mockQb([platformProduct]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('platform-1');
      expect(result[0].listingType).toBe(ListingType.PLATFORM);
    });

    it('returns APPROVED-vendor listings', async () => {
      mockQb([approvedVendorProduct]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('approved-1');
      expect(result[0].listingType).toBe(ListingType.VENDOR);
    });

    // The fake QueryBuilder genuinely excludes these — it is the query's doing, not a hand-forced [].
    const nonApprovedCases: ReadonlyArray<[VendorStatus, string, Product]> = [
      [VendorStatus.PENDING, 'pending-1', pendingVendorProduct],
      [VendorStatus.REJECTED, 'rejected-1', rejectedVendorProduct],
      [VendorStatus.SUSPENDED, 'suspended-1', suspendedVendorProduct],
    ];

    it.each(nonApprovedCases)(
      'excludes a %s-vendor product from the catalogue',
      async (_status, productId, product) => {
        mockQb([product]);

        const result = await service.findAll();

        expect(result.map((p) => p.id)).not.toContain(productId);
      },
    );

    it('builds the query with the expected joins and the approved-vendor visibility predicate', async () => {
      const qb = mockQb([]);

      await service.findAll();

      expect(productRepo.createQueryBuilder).toHaveBeenCalledWith('product');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('product.images', 'images');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('product.vendor', 'vendor');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('product.categories', 'categories');
      expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('platformType'), {
        platformType: ListingType.PLATFORM,
        vendorType: ListingType.VENDOR,
        approvedStatus: VendorStatus.APPROVED,
      });
    });

    it('returns an empty array when the repository is empty', async () => {
      mockQb([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });

    it('returns only PLATFORM and APPROVED-vendor listings from a mixed fixture set', async () => {
      mockQb(ALL_PRODUCTS);

      const result = await service.findAll();
      const ids = result.map((p) => p.id);

      expect(ids).toContain('platform-1');
      expect(ids).toContain('approved-1');
      expect(ids).not.toContain('pending-1');
      expect(ids).not.toContain('rejected-1');
      expect(ids).not.toContain('suspended-1');
    });

    it('behaves exactly as before when called with no params', async () => {
      const qb = mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll();

      expect(qb.andWhere).not.toHaveBeenCalled();
      const ids = result.map((p) => p.id);
      expect(ids).toEqual(
        expect.arrayContaining(['platform-gadget', 'approved-gadget', 'approved-homeware']),
      );
      expect(ids).not.toContain('pending-gadget');
    });

    it('filters by categoryId only', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ categoryId: 'cat-gadgets' });
      const ids = result.map((p) => p.id);

      expect(ids).toEqual(expect.arrayContaining(['platform-gadget', 'approved-gadget']));
      expect(ids).not.toContain('approved-homeware');
      // Non-approved vendor listing must never resurface even if it matches the category.
      expect(ids).not.toContain('pending-gadget');
    });

    it('returns an empty list for an unknown categoryId (not an error)', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ categoryId: 'does-not-exist' });

      expect(result).toEqual([]);
    });

    it('filters by q only (case-insensitive, matches name or description)', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ q: 'SPEAKER' });
      const ids = result.map((p) => p.id);

      expect(ids).toEqual(['approved-gadget']);
    });

    it('matches q against description as well as name', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ q: 'glazed' });
      const ids = result.map((p) => p.id);

      expect(ids).toEqual(['approved-homeware']);
    });

    it('filters by vendorId only', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ vendorId: 'v1' });
      const ids = result.map((p) => p.id);

      expect(ids).toEqual(expect.arrayContaining(['approved-gadget', 'approved-homeware']));
      expect(ids).not.toContain('platform-gadget');
      expect(ids).not.toContain('pending-gadget');
    });

    it('composes categoryId + q + vendorId together (AND semantics)', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({
        categoryId: 'cat-gadgets',
        q: 'speaker',
        vendorId: 'v1',
      });

      expect(result.map((p) => p.id)).toEqual(['approved-gadget']);
    });

    it('never resurfaces a non-approved vendor listing under any param combination', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const byCategory = await service.findAll({ categoryId: 'cat-gadgets' });
      const byQuery = await service.findAll({ q: 'charger' });
      const byVendor = await service.findAll({ vendorId: 'v2' });
      const combined = await service.findAll({ categoryId: 'cat-gadgets', q: 'charger' });

      expect(byCategory.map((p) => p.id)).not.toContain('pending-gadget');
      expect(byQuery.map((p) => p.id)).not.toContain('pending-gadget');
      expect(byVendor.map((p) => p.id)).not.toContain('pending-gadget');
      expect(combined.map((p) => p.id)).not.toContain('pending-gadget');
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
