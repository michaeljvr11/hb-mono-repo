import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Brackets } from 'typeorm';
import { CurrencyCode, CountryCode, VendorStatus } from '@hb/shared';
import { SearchService } from './search.service';
import { ProductSearchService } from './product-search.service';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Category } from '../categories/entities/category.entity';

const makeVendor = (overrides: Partial<Vendor> = {}): Vendor =>
  ({
    id: 'v1',
    businessName: 'Test Vendor Co',
    tradingName: 'TVC',
    status: VendorStatus.APPROVED,
    countryCode: CountryCode.SOUTH_AFRICA,
    ...overrides,
  }) as Vendor;

const makeCategory = (overrides: Partial<Category> = {}): Category =>
  ({
    id: 'c1',
    name: 'Gadgets',
    slug: 'gadgets',
    displayOrder: 0,
    ...overrides,
  }) as Category;

// ── Generic fake QueryBuilder (vendors/categories only — products delegate
// to ProductSearchService, see the "products" describe block below) ────────
// Accumulates predicates issued via .where()/.andWhere() and applies .take() +
// the predicates for real against the provided fixture list on .getMany().
type Predicate<T> = (item: T) => boolean;
type WhereArg = string | Brackets;

interface FakeQueryBuilder<T> {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orWhere: jest.Mock;
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
    orWhere: jest.fn(),
    take: jest.fn(),
    getMany: jest.fn<Promise<T[]>, []>(),
  };

  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.where.mockImplementation((arg: WhereArg, params?: Record<string, unknown>) => {
    predicates.push(interpret(arg as string, params));
    return qb;
  });
  qb.andWhere.mockImplementation((arg: WhereArg, params?: Record<string, unknown>) => {
    predicates.push(interpret(arg as string, params));
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
  let vendorRepo: Record<string, jest.Mock>;
  let categoryRepo: Record<string, jest.Mock>;
  let productSearchService: { suggest: jest.Mock };

  beforeEach(async () => {
    vendorRepo = { createQueryBuilder: jest.fn() };
    categoryRepo = { createQueryBuilder: jest.fn() };
    productSearchService = { suggest: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: ProductSearchService, useValue: productSearchService },
      ],
    }).compile();

    service = module.get(SearchService);
  });

  afterEach(() => jest.clearAllMocks());

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
    mockVendors([]);
    mockCategories([]);

    const result = await service.suggest('anything');

    expect(result).toEqual({ products: [], vendors: [], categories: [] });
  });

  // The `products` group is fed by the Meilisearch-backed ProductSearchService
  // (card #48/#50 landmine resolution: one GET /search/suggest route, no
  // competing Postgres-vs-Meilisearch product suggest paths). Approved-vendor
  // visibility, ranking, and typo-tolerance for products are ProductSearchService's
  // responsibility and are covered by its own spec (product-search.service.spec.ts).
  describe('products', () => {
    it('delegates to ProductSearchService.suggest with the raw query', async () => {
      mockVendors([]);
      mockCategories([]);

      await service.suggest('speaker');

      expect(productSearchService.suggest).toHaveBeenCalledWith('speaker');
    });

    it('passes through whatever ProductSearchService.suggest returns', async () => {
      mockVendors([]);
      mockCategories([]);
      const suggestion = {
        id: 'p-speaker',
        name: 'Bluetooth Speaker',
        price: 249.5,
        currency: CurrencyCode.ZAR,
        imageUrl: '/img/primary.jpg',
        vendorName: 'Test Vendor Co',
      };
      productSearchService.suggest.mockResolvedValue([suggestion]);

      const result = await service.suggest('speaker');

      expect(result.products).toEqual([suggestion]);
    });

    it('caps the products group at 5 even if the engine ever returns more', async () => {
      mockVendors([]);
      mockCategories([]);
      const many = Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`,
        name: `Widget ${i}`,
        price: 10,
        currency: CurrencyCode.ZAR,
        imageUrl: null,
        vendorName: null,
      }));
      productSearchService.suggest.mockResolvedValue(many);

      const result = await service.suggest('widget');

      expect(result.products).toHaveLength(5);
    });
  });

  describe('vendors', () => {
    it('matches on businessName or tradingName', async () => {
      const vendor = makeVendor({ id: 'v-match', businessName: 'Kalahari Crafts' });
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
      mockVendors([vendor]);
      mockCategories([]);

      const result = await service.suggest('hidden');

      expect(result.vendors).toEqual([]);
    });
  });

  describe('categories', () => {
    it('matches on category name', async () => {
      const category = makeCategory({ id: 'c-match', name: 'Homeware', slug: 'homeware' });
      mockVendors([]);
      mockCategories([category]);

      const result = await service.suggest('home');

      expect(result.categories).toEqual([{ id: 'c-match', name: 'Homeware', slug: 'homeware' }]);
    });

    it('caps category suggestions at 5', async () => {
      const categories = Array.from({ length: 6 }, (_, i) =>
        makeCategory({ id: `c${i}`, name: `Category ${i}`, slug: `category-${i}` }),
      );
      mockVendors([]);
      mockCategories(categories);

      const result = await service.suggest('category');

      expect(result.categories).toHaveLength(5);
    });

    it('falls back to null slug when the category has none', async () => {
      const category = makeCategory({ id: 'c-no-slug', name: 'No Slug', slug: undefined });
      mockVendors([]);
      mockCategories([category]);

      const result = await service.suggest('no slug');

      expect(result.categories[0].slug).toBeNull();
    });
  });
});
