import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Brackets } from 'typeorm';
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
type WhereArg = string | Brackets;

interface FakeQueryBuilder<T> {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orWhere: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock<Promise<T[]>, []>;
}

/**
 * Minimal WhereExpressionBuilder stand-in used to invoke a Brackets'
 * whereFactory and capture the inner where/orWhere predicates exactly as
 * TypeORM would when materialising a bracketed group.
 */
function captureBracketPredicates<T>(
  brackets: Brackets,
  interpret: (sql: string, params?: Record<string, unknown>) => Predicate<T>,
): Predicate<T>[] {
  const inner: Predicate<T>[] = [];

  const innerQb = {
    where: (sql: string, params?: Record<string, unknown>) => {
      inner.push(interpret(sql, params));
      return innerQb;
    },
    orWhere: (sql: string, params?: Record<string, unknown>) => {
      inner.push(interpret(sql, params));
      return innerQb;
    },
  };

  brackets.whereFactory(innerQb as never);
  return inner;
}

function buildFakeQueryBuilder<T>(
  stored: T[],
  interpret: (sql: string, params?: Record<string, unknown>) => Predicate<T>,
): FakeQueryBuilder<T> {
  const predicates: Predicate<T>[] = [];
  let limit: number | undefined;

  const resolveWhereArg = (arg: WhereArg, params?: Record<string, unknown>): Predicate<T> => {
    if (arg instanceof Brackets) {
      const inner = captureBracketPredicates(arg, interpret);
      // A Brackets group ORs together everything registered via where/orWhere
      // inside its factory — mirror that when composing the group predicate.
      return (item) => inner.some((pred) => pred(item));
    }
    return interpret(arg, params);
  };

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
    predicates.push(resolveWhereArg(arg, params));
    return qb;
  });
  qb.andWhere.mockImplementation((arg: WhereArg, params?: Record<string, unknown>) => {
    predicates.push(resolveWhereArg(arg, params));
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
  if (sql === 'product.listingType = :platformType') {
    const platformType = params?.platformType as ListingType;
    return (p) => p.listingType === platformType;
  }
  if (sql.includes('vendor.status = :approvedStatus')) {
    const vendorType = params?.vendorType as ListingType;
    const approvedStatus = params?.approvedStatus as VendorStatus;
    return (p) => p.listingType === vendorType && p.vendor?.status === approvedStatus;
  }
  if (sql.includes('product.name ILIKE :q')) {
    const q = ((params?.q as string) ?? '').replace(/%/g, '').toLowerCase();
    return (p) => p.name.toLowerCase().includes(q);
  }
  throw new Error(`Unrecognised product predicate in test fake: ${sql}`);
}

// ── SQL-precedence-faithful fake QueryBuilder (regression guard only) ──────
// The predicate-AND-of-predicates fake above models *intent*, not raw SQL —
// it would happily "pass" even if the service emitted an unparenthesized
// `WHERE a OR b AND c` string, because each predicate is still evaluated and
// ANDed together at the JS level regardless of how the SQL groups them. This
// fake instead reproduces the top-level boolean shape of
// `WHERE <arg1> AND <arg2>` for whatever was passed to the initial .where()
// call:
//   - Brackets (fixed code): the visibility check is ONE grouped operand, so
//     it participates in the AND chain like any other term:
//       (platform OR vendorApproved) AND nameMatches
//   - raw string (old buggy code): the string itself contains a bare
//     top-level `t1 OR t2`, so per real SQL/Postgres precedence (AND binds
//     tighter than OR) the whole expression groups as:
//       t1 OR (t2 AND nameMatches)
//     i.e. the platform term (t1) alone determines a match, bypassing the
//     name filter — reproducing the reported bug exactly.
interface SqlPrecedenceQueryBuilder {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
  getSql: () => string;
}

function buildSqlPrecedenceFakeQueryBuilder(stored: Product[]): SqlPrecedenceQueryBuilder {
  let visibilityShape: 'bracketed' | 'raw';
  let platformTerm: Predicate<Product> = () => false;
  let vendorApprovedTerm: Predicate<Product> = () => false;
  let nameFilter: Predicate<Product> = () => true;
  let limit: number | undefined;
  let sql = '';

  const qb: SqlPrecedenceQueryBuilder = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    take: jest.fn(),
    getMany: jest.fn(),
    getSql: () => sql,
  };

  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.where.mockImplementation((arg: WhereArg) => {
    if (arg instanceof Brackets) {
      visibilityShape = 'bracketed';
      const inner = captureBracketPredicates(arg, interpretProductPredicate);
      platformTerm = (p) => inner.some((pred) => pred(p));
      vendorApprovedTerm = () => false; // folded into platformTerm already
      sql +=
        '(product.listingType = :platformType OR (product.listingType = :vendorType AND vendor.status = :approvedStatus))';
    } else {
      visibilityShape = 'raw';
      platformTerm = (p) => p.listingType === ListingType.PLATFORM;
      vendorApprovedTerm = (p) =>
        p.listingType === ListingType.VENDOR && p.vendor?.status === VendorStatus.APPROVED;
      sql += arg;
    }
    return qb;
  });
  qb.andWhere.mockImplementation((arg: WhereArg, params?: Record<string, unknown>) => {
    const clauseSql = arg as string;
    sql += ` AND ${clauseSql}`;
    nameFilter = interpretProductPredicate(clauseSql, params);
    return qb;
  });
  qb.take.mockImplementation((n: number) => {
    limit = n;
    return qb;
  });
  qb.getMany.mockImplementation(() => {
    const combined: Predicate<Product> =
      visibilityShape === 'bracketed'
        ? (p) => platformTerm(p) && nameFilter(p)
        : // raw string: t1 OR (t2 AND nameFilter) — platform bypasses the name filter
          (p) => platformTerm(p) || (vendorApprovedTerm(p) && nameFilter(p));
    const matches = stored.filter((p) => combined(p));
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

    // ── Regression guard: SQL operator precedence ───────────────────────────
    // Reproduces the exact bug the fake-QB-with-.every() suite above cannot
    // catch: passing the visibility clause as a raw string to .where() and
    // adding the name filter via .andWhere() emits `WHERE t1 OR t2 AND c3`.
    // Because AND binds tighter than OR, this groups as `t1 OR (t2 AND c3)`,
    // so a PLATFORM listing (t1) matches regardless of the `q` name filter.
    // Wrapping the visibility clause in Brackets fixes this by making it a
    // single grouped AND-operand.
    describe('visibility clause structure (regression guard for AND/OR precedence bug)', () => {
      it('passes the visibility clause to .where() as a Brackets instance, not a raw string', async () => {
        const qb = mockProducts([]);
        mockVendors([]);
        mockCategories([]);

        await service.suggest('anything');

        expect(qb.where).toHaveBeenCalledTimes(1);
        const [visibilityArg]: [WhereArg] = qb.where.mock.calls[0] as [WhereArg];
        expect(visibilityArg).toBeInstanceOf(Brackets);
        expect(typeof visibilityArg).not.toBe('string');
      });

      it('the Brackets group ORs exactly the platform and approved-vendor terms', async () => {
        const qb = mockProducts([]);
        mockVendors([]);
        mockCategories([]);

        await service.suggest('anything');

        const [visibilityArg]: [WhereArg] = qb.where.mock.calls[0] as [WhereArg];
        const brackets = visibilityArg as Brackets;
        const innerPredicates = captureBracketPredicates(brackets, interpretProductPredicate);

        const platformProduct = makeProduct({ listingType: ListingType.PLATFORM });
        const approvedProduct = makeProduct({
          listingType: ListingType.VENDOR,
          vendor: makeVendor({ status: VendorStatus.APPROVED }),
        });
        const pendingProduct = makeProduct({
          listingType: ListingType.VENDOR,
          vendor: makeVendor({ status: VendorStatus.PENDING }),
        });

        expect(innerPredicates).toHaveLength(2);
        expect(innerPredicates[0](platformProduct)).toBe(true);
        expect(innerPredicates[0](approvedProduct)).toBe(false);
        expect(innerPredicates[1](approvedProduct)).toBe(true);
        expect(innerPredicates[1](pendingProduct)).toBe(false);
      });

      it('the name filter is registered via .andWhere, never .where', async () => {
        const qb = mockProducts([]);
        mockVendors([]);
        mockCategories([]);

        await service.suggest('speaker');

        expect(qb.where).toHaveBeenCalledTimes(1);
        expect(qb.andWhere).toHaveBeenCalledTimes(1);
      });

      it('[SQL-precedence fake] a platform listing that fails the name filter is excluded once bracketed (old raw-string code would incorrectly include it)', async () => {
        const platformProduct = makeProduct({
          id: 'platform-no-match',
          name: 'Solar Charger',
          listingType: ListingType.PLATFORM,
        });
        const sqlQb = buildSqlPrecedenceFakeQueryBuilder([platformProduct]);
        productRepo.createQueryBuilder.mockReturnValue(sqlQb);
        mockVendors([]);
        mockCategories([]);

        // "speaker" does not match "Solar Charger" — under real SQL precedence
        // with an unbracketed visibility clause, the platform listing would
        // still be returned (it satisfies the bare `t1` OR term), which is
        // the reported bug.
        const result = await service.suggest('speaker');

        expect(result.products).toEqual([]);
        expect(sqlQb.getSql()).toContain(
          '(product.listingType = :platformType OR (product.listingType = :vendorType AND vendor.status = :approvedStatus))',
        );
      });

      it('[SQL-precedence fake] a platform listing still matches a satisfied name filter (sanity check)', async () => {
        const platformProduct = makeProduct({
          id: 'platform-match',
          name: 'Bluetooth Speaker',
          listingType: ListingType.PLATFORM,
        });
        const sqlQb = buildSqlPrecedenceFakeQueryBuilder([platformProduct]);
        productRepo.createQueryBuilder.mockReturnValue(sqlQb);
        mockVendors([]);
        mockCategories([]);

        const result = await service.suggest('speaker');

        expect(result.products.map((p) => p.id)).toEqual(['platform-match']);
      });
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
