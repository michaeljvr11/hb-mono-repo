import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CurrencyCode, CountryCode, ListingType, VendorStatus } from '@hb/shared';
import { SearchService } from './search.service';
import { Product } from '../products/entities/product.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Category } from '../categories/entities/category.entity';

const NOW = new Date('2026-06-01T10:00:00.000Z');

const makeVendor = (overrides: Partial<Vendor> = {}): Vendor =>
  ({
    id: 'v1',
    businessName: 'Test Vendor Co',
    tradingName: 'TVC',
    status: VendorStatus.APPROVED,
    countryCode: CountryCode.SOUTH_AFRICA,
    ...overrides,
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

const makeCategory = (overrides: Partial<Category> = {}): Category =>
  ({
    id: 'c1',
    name: 'Gadgets',
    slug: 'gadgets',
    displayOrder: 0,
    ...overrides,
  }) as Category;

// ── Generic fake QueryBuilder ─────────────────────────────────────────────────
// Accumulates predicates issued via .where()/.andWhere() and applies .take() +
// the predicates for real against the provided fixture list on .getMany().
type Predicate<T> = (item: T) => boolean;

interface FakeQueryBuilder<T> {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock<Promise<T[]>, []>;
}

function buildFakeQueryBuilder<T>(
  stored: T[],
  interpret: (sql: string, params?: Record<string, unknown>) => Predicate<T>,
): FakeQueryBuilder<T> {
  const predicates: Predicate<T>[] = [];
  let limit: number | undefined;

  const qb: FakeQueryBuilder<T> = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    take: jest.fn(),
    getMany: jest.fn<Promise<T[]>, []>(),
  };

  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.where.mockImplementation((sql: string, params?: Record<string, unknown>) => {
    predicates.push(interpret(sql, params));
    return qb;
  });
  qb.andWhere.mockImplementation((sql: string, params?: Record<string, unknown>) => {
    predicates.push(interpret(sql, params));
    return qb;
  });
  qb.take.mockImplementation((n: number) => {
    limit = n;
    return qb;
  });
  qb.getMany.mockImplementation(() => {
    const matches = stored.filter((item) => predicates.every((pred) => pred(item)));
    return Promise.resolve(limit !== undefined ? matches.slice(0, limit) : matches);
  });

  return qb;
}

function interpretProductPredicate(
  sql: string,
  params?: Record<string, unknown>,
): Predicate<Product> {
  if (sql.includes('vendor.status = :approvedStatus') && sql.includes('platformType')) {
    return (p) =>
      p.listingType === ListingType.PLATFORM ||
      (p.listingType === ListingType.VENDOR && p.vendor?.status === VendorStatus.APPROVED);
  }
  if (sql.includes('product.name ILIKE :q')) {
    const q = ((params?.q as string) ?? '').replace(/%/g, '').toLowerCase();
    return (p) => p.name.toLowerCase().includes(q);
  }
  throw new Error(`Unrecognised product predicate in test fake: ${sql}`);
}

function interpretVendorPredicate(
  sql: string,
  params?: Record<string, unknown>,
): Predicate<Vendor> {
  if (sql.includes('vendor.status = :approvedStatus')) {
    return (v) => v.status === VendorStatus.APPROVED;
  }
  if (sql.includes('businessName ILIKE :q OR vendor.tradingName ILIKE :q')) {
    const q = ((params?.q as string) ?? '').replace(/%/g, '').toLowerCase();
    return (v) =>
      v.businessName.toLowerCase().includes(q) || !!v.tradingName?.toLowerCase().includes(q);
  }
  throw new Error(`Unrecognised vendor predicate in test fake: ${sql}`);
}

function interpretCategoryPredicate(
  sql: string,
  params?: Record<string, unknown>,
): Predicate<Category> {
  if (sql.includes('category.name ILIKE :q')) {
    const q = ((params?.q as string) ?? '').replace(/%/g, '').toLowerCase();
    return (c) => c.name.toLowerCase().includes(q);
  }
  throw new Error(`Unrecognised category predicate in test fake: ${sql}`);
}

describe('SearchService', () => {
  let service: SearchService;
  let productRepo: Record<string, jest.Mock>;
  let vendorRepo: Record<string, jest.Mock>;
  let categoryRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    productRepo = { createQueryBuilder: jest.fn() };
    vendorRepo = { createQueryBuilder: jest.fn() };
    categoryRepo = { createQueryBuilder: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
      ],
    }).compile();

    service = module.get(SearchService);
  });

  afterEach(() => jest.clearAllMocks());

  function mockProducts(stored: Product[]) {
    const qb = buildFakeQueryBuilder(stored, interpretProductPredicate);
    productRepo.createQueryBuilder.mockReturnValue(qb);
    return qb;
  }

  function mockVendors(stored: Vendor[]) {
    const qb = buildFakeQueryBuilder(stored, interpretVendorPredicate);
    vendorRepo.createQueryBuilder.mockReturnValue(qb);
    return qb;
  }

  function mockCategories(stored: Category[]) {
    const qb = buildFakeQueryBuilder(stored, interpretCategoryPredicate);
    categoryRepo.createQueryBuilder.mockReturnValue(qb);
    return qb;
  }

  it('returns a grouped shape with products, vendors, and categories', async () => {
    mockProducts([]);
    mockVendors([]);
    mockCategories([]);

    const result = await service.suggest('anything');

    expect(result).toEqual({ products: [], vendors: [], categories: [] });
  });

  describe('products', () => {
    it('maps product fields, primary image, and vendor business name', async () => {
      const vendor = makeVendor();
      const product = makeProduct({
        id: 'p-speaker',
        name: 'Bluetooth Speaker',
        price: 249.5,
        currency: CurrencyCode.ZAR,
        listingType: ListingType.VENDOR,
        vendor,
        vendorId: vendor.id,
        images: [
          { id: 'i1', url: '/img/1.jpg', isPrimary: false, displayOrder: 1 } as never,
          { id: 'i2', url: '/img/primary.jpg', isPrimary: true, displayOrder: 0 } as never,
        ],
      });
      mockProducts([product]);
      mockVendors([]);
      mockCategories([]);

      const result = await service.suggest('speaker');

      expect(result.products).toEqual([
        {
          id: 'p-speaker',
          name: 'Bluetooth Speaker',
          price: 249.5,
          currency: CurrencyCode.ZAR,
          imageUrl: '/img/primary.jpg',
          vendorName: 'Test Vendor Co',
        },
      ]);
    });

    it('has null imageUrl and vendorName for a platform listing with no images', async () => {
      const product = makeProduct({
        id: 'p-platform',
        name: 'Solar Charger',
        listingType: ListingType.PLATFORM,
        vendor: undefined,
        images: [],
      });
      mockProducts([product]);
      mockVendors([]);
      mockCategories([]);

      const result = await service.suggest('charger');

      expect(result.products[0].imageUrl).toBeNull();
      expect(result.products[0].vendorName).toBeNull();
    });

    it('caps product suggestions at 5', async () => {
      const products = Array.from({ length: 8 }, (_, i) =>
        makeProduct({ id: `p${i}`, name: `Widget ${i}` }),
      );
      mockProducts(products);
      mockVendors([]);
      mockCategories([]);

      const result = await service.suggest('widget');

      expect(result.products).toHaveLength(5);
    });

    // Approved-vendor visibility rule must compose identically to ProductsService.findAll —
    // a pending/rejected/suspended vendor's listing must never appear in suggestions.
    const nonApprovedStatuses = [
      VendorStatus.PENDING,
      VendorStatus.REJECTED,
      VendorStatus.SUSPENDED,
    ];

    it.each(nonApprovedStatuses)('excludes a product whose vendor status is %s', async (status) => {
      const product = makeProduct({
        id: 'p-hidden',
        name: 'Hidden Gadget',
        listingType: ListingType.VENDOR,
        vendor: makeVendor({ status }),
        vendorId: 'v1',
      });
      mockProducts([product]);
      mockVendors([]);
      mockCategories([]);

      const result = await service.suggest('gadget');

      expect(result.products).toEqual([]);
    });

    it('always includes PLATFORM listings regardless of any vendor', async () => {
      const product = makeProduct({
        id: 'p-platform-2',
        name: 'Platform Gadget',
        listingType: ListingType.PLATFORM,
        vendor: undefined,
      });
      mockProducts([product]);
      mockVendors([]);
      mockCategories([]);

      const result = await service.suggest('gadget');

      expect(result.products.map((p) => p.id)).toContain('p-platform-2');
    });
  });

  describe('vendors', () => {
    it('matches on businessName or tradingName', async () => {
      const vendor = makeVendor({ id: 'v-match', businessName: 'Kalahari Crafts' });
      mockProducts([]);
      mockVendors([vendor]);
      mockCategories([]);

      const result = await service.suggest('kalahari');

      expect(result.vendors).toEqual([
        { id: 'v-match', businessName: 'Kalahari Crafts', countryCode: CountryCode.SOUTH_AFRICA },
      ]);
    });

    it('caps vendor suggestions at 5', async () => {
      const vendors = Array.from({ length: 7 }, (_, i) =>
        makeVendor({ id: `v${i}`, businessName: `Vendor ${i}` }),
      );
      mockProducts([]);
      mockVendors(vendors);
      mockCategories([]);

      const result = await service.suggest('vendor');

      expect(result.vendors).toHaveLength(5);
    });

    // Non-approved vendors must never appear, parametrized over every non-approved status.
    const nonApprovedStatuses = [
      VendorStatus.PENDING,
      VendorStatus.REJECTED,
      VendorStatus.SUSPENDED,
    ];

    it.each(nonApprovedStatuses)('excludes a %s vendor from suggestions', async (status) => {
      const vendor = makeVendor({ id: 'v-hidden', businessName: 'Hidden Vendor', status });
      mockProducts([]);
      mockVendors([vendor]);
      mockCategories([]);

      const result = await service.suggest('hidden');

      expect(result.vendors).toEqual([]);
    });
  });

  describe('categories', () => {
    it('matches on category name', async () => {
      const category = makeCategory({ id: 'c-match', name: 'Homeware', slug: 'homeware' });
      mockProducts([]);
      mockVendors([]);
      mockCategories([category]);

      const result = await service.suggest('home');

      expect(result.categories).toEqual([{ id: 'c-match', name: 'Homeware', slug: 'homeware' }]);
    });

    it('caps category suggestions at 5', async () => {
      const categories = Array.from({ length: 6 }, (_, i) =>
        makeCategory({ id: `c${i}`, name: `Category ${i}`, slug: `category-${i}` }),
      );
      mockProducts([]);
      mockVendors([]);
      mockCategories(categories);

      const result = await service.suggest('category');

      expect(result.categories).toHaveLength(5);
    });

    it('falls back to null slug when the category has none', async () => {
      const category = makeCategory({ id: 'c-no-slug', name: 'No Slug', slug: undefined });
      mockProducts([]);
      mockVendors([]);
      mockCategories([category]);

      const result = await service.suggest('no slug');

      expect(result.categories[0].slug).toBeNull();
    });
  });
});
