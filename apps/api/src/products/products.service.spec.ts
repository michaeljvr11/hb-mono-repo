import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { Brackets } from 'typeorm';
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
type WhereArg = string | Brackets;

interface FakeQueryBuilder {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
  getManyAndCount: jest.Mock;
}

type SortDirection = 'ASC' | 'DESC';

/** Resolves the raw value used to compare two products for a given orderBy() column string. */
function orderableValue(product: Product, column: string): string | number {
  switch (column) {
    case 'product.createdAt':
      return product.createdAt.getTime();
    case 'product.price':
      return product.price;
    case 'product.name':
      return product.name;
    case 'product.id':
      return product.id;
    default:
      throw new Error(`Unrecognised order column in test fake: ${column}`);
  }
}

/**
 * Minimal WhereExpressionBuilder stand-in used to invoke a Brackets'
 * whereFactory and capture the inner where/orWhere predicates exactly as
 * TypeORM would when materialising a bracketed group.
 */
function captureBracketPredicates(brackets: Brackets): Predicate[] {
  const inner: Predicate[] = [];
  let combined: Predicate | undefined;

  const innerQb = {
    where: (sql: string, params?: Record<string, unknown>) => {
      combined = interpretPredicate(sql, params);
      inner.push(combined);
      return innerQb;
    },
    orWhere: (sql: string, params?: Record<string, unknown>) => {
      const next = interpretPredicate(sql, params);
      const prev = combined;
      combined = prev ? (p: Product) => prev(p) || next(p) : next;
      inner.push(next);
      return innerQb;
    },
  };

  brackets.whereFactory(innerQb as never);
  return inner;
}

function interpretPredicate(sql: string, params?: Record<string, unknown>): Predicate {
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

/** Resolves a where()/andWhere() argument (raw SQL string or Brackets) to a Predicate. */
function interpretWhereArg(arg: WhereArg, params?: Record<string, unknown>): Predicate {
  if (arg instanceof Brackets) {
    const inner = captureBracketPredicates(arg);
    // A Brackets group ORs together everything registered via where/orWhere
    // inside its factory — mirror that when composing the group predicate.
    return (p) => inner.some((pred) => pred(p));
  }
  return interpretPredicate(arg, params);
}

function buildFakeQueryBuilder(stored: Product[]): FakeQueryBuilder {
  const predicates: Predicate[] = [];
  const orderTerms: Array<{ column: string; direction: SortDirection }> = [];
  let skipValue = 0;
  let takeValue: number | undefined;

  const qb: FakeQueryBuilder = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
  };

  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.where.mockImplementation((arg: WhereArg, params?: Record<string, unknown>) => {
    predicates.push(interpretWhereArg(arg, params));
    return qb;
  });
  qb.andWhere.mockImplementation((arg: WhereArg, params?: Record<string, unknown>) => {
    predicates.push(interpretWhereArg(arg, params));
    return qb;
  });
  // orderBy() resets any prior ordering (mirrors real TypeORM); addOrderBy() appends.
  qb.orderBy.mockImplementation((column: string, direction: SortDirection) => {
    orderTerms.length = 0;
    orderTerms.push({ column, direction });
    return qb;
  });
  qb.addOrderBy.mockImplementation((column: string, direction: SortDirection) => {
    orderTerms.push({ column, direction });
    return qb;
  });
  qb.skip.mockImplementation((value: number) => {
    skipValue = value;
    return qb;
  });
  qb.take.mockImplementation((value: number) => {
    takeValue = value;
    return qb;
  });

  function matched(): Product[] {
    return stored.filter((p) => predicates.every((pred) => pred(p)));
  }

  function sorted(products: Product[]): Product[] {
    if (!orderTerms.length) return products;
    return [...products].sort((a, b) => {
      for (const { column, direction } of orderTerms) {
        const av = orderableValue(a, column);
        const bv = orderableValue(b, column);
        if (av === bv) continue;
        const cmp = av < bv ? -1 : 1;
        return direction === 'ASC' ? cmp : -cmp;
      }
      return 0;
    });
  }

  function page(products: Product[]): Product[] {
    return takeValue !== undefined
      ? products.slice(skipValue, skipValue + takeValue)
      : products.slice(skipValue);
  }

  qb.getMany.mockImplementation(() => Promise.resolve(page(sorted(matched()))));
  qb.getManyAndCount.mockImplementation(() => {
    const all = matched();
    return Promise.resolve([page(sorted(all)), all.length]);
  });

  return qb;
}

// ── SQL-precedence-faithful fake QueryBuilder (regression guard only) ────────
// The predicate-AND-of-predicates fake above models *intent*, not raw SQL —
// it would happily "pass" even if the service emitted an unparenthesized
// `WHERE a OR b AND c` string, because each predicate is still evaluated and
// ANDed together at the JS level regardless of how the SQL groups them. This
// fake instead concatenates raw SQL fragments the way the old buggy code did
// (string concatenation with naive AND/OR precedence: AND binds tighter than
// OR) so it can actually fail against the pre-fix implementation.
interface SqlPrecedenceQueryBuilder {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
  getManyAndCount: jest.Mock;
  getSql: () => string;
}

function buildSqlPrecedenceFakeQueryBuilder(stored: Product[]): SqlPrecedenceQueryBuilder {
  // Models the *actual* top-level boolean shape of `WHERE <arg1> AND <arg2> AND ...`
  // for whatever was passed to the initial .where() call:
  //   - Brackets (fixed code): the visibility check is ONE grouped operand,
  //     so it participates in the AND chain like any other term:
  //       (platform OR vendorApproved) AND c1 AND c2 AND ...
  //   - raw string (old buggy code): the string itself contains a bare
  //     top-level `t1 OR t2`, so per real SQL/Postgres precedence (AND binds
  //     tighter than OR) the whole expression groups as:
  //       t1 OR (t2 AND c1 AND c2 AND ...)
  //     i.e. the platform term (t1) alone determines a match, bypassing every
  //     subsequent andWhere filter — reproducing the reported bug exactly.
  let visibilityShape: 'bracketed' | 'raw';
  let platformTerm: Predicate = () => false;
  let vendorApprovedTerm: Predicate = () => false;
  const filterTerms: Predicate[] = []; // every subsequent .andWhere() clause
  let sql = '';

  const qb: SqlPrecedenceQueryBuilder = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
    getSql: () => sql,
  };

  qb.leftJoinAndSelect.mockReturnValue(qb);
  // Ordering/pagination aren't the concern of this fake — chainable no-ops.
  qb.orderBy.mockReturnValue(qb);
  qb.addOrderBy.mockReturnValue(qb);
  qb.skip.mockReturnValue(qb);
  qb.take.mockReturnValue(qb);
  qb.where.mockImplementation((arg: WhereArg) => {
    if (arg instanceof Brackets) {
      visibilityShape = 'bracketed';
      const inner = captureBracketPredicates(arg);
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
    filterTerms.push(interpretPredicate(clauseSql, params));
    return qb;
  });
  function matched(): Product[] {
    const filtersMatch: Predicate = (p) => filterTerms.every((pred) => pred(p));
    const combined: Predicate =
      visibilityShape === 'bracketed'
        ? (p) => platformTerm(p) && filtersMatch(p)
        : // raw string: t1 OR (t2 AND c1 AND c2 ...) — platform bypasses every filter
          (p) => platformTerm(p) || (vendorApprovedTerm(p) && filtersMatch(p));
    return stored.filter((p) => combined(p));
  }

  qb.getMany.mockImplementation(() => Promise.resolve(matched()));
  // Ordering/pagination aren't the concern of this fake (regression guard for
  // AND/OR precedence only) — return the full matched set alongside its count.
  qb.getManyAndCount.mockImplementation(() => {
    const all = matched();
    return Promise.resolve([all, all.length]);
  });

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
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('platform-1');
      expect(result.items[0].listingType).toBe(ListingType.PLATFORM);
    });

    it('returns APPROVED-vendor listings', async () => {
      mockQb([approvedVendorProduct]);

      const result = await service.findAll();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('approved-1');
      expect(result.items[0].listingType).toBe(ListingType.VENDOR);
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

        expect(result.items.map((p) => p.id)).not.toContain(productId);
      },
    );

    it('builds the query with the expected joins and the approved-vendor visibility predicate', async () => {
      const qb = mockQb([]);

      await service.findAll();

      expect(productRepo.createQueryBuilder).toHaveBeenCalledWith('product');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('product.images', 'images');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('product.vendor', 'vendor');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('product.categories', 'categories');
      expect(qb.where).toHaveBeenCalledTimes(1);
      const [visibilityArg]: [WhereArg] = qb.where.mock.calls[0] as [WhereArg];
      expect(visibilityArg).toBeInstanceOf(Brackets);
    });

    // ── Regression guard: SQL operator precedence ─────────────────────────────
    // Reproduces the exact bug the fake-QB-with-.every() suite above cannot
    // catch: passing the visibility clause as a raw string to .where() and
    // adding filters via .andWhere() emits `WHERE t1 OR t2 AND c1 AND c2 ...`.
    // Because AND binds tighter than OR, this groups as `t1 OR (t2 AND ...)`,
    // so a PLATFORM listing (t1) matches regardless of any filter. Wrapping
    // the visibility clause in Brackets fixes this by making it a single
    // grouped AND-operand. These assertions operate directly on what the
    // service passes to .where()/.andWhere(), independent of any fake QB,
    // so they fail on the old raw-string code and pass on the fixed code.
    describe('visibility clause structure (regression guard for AND/OR precedence bug)', () => {
      it('passes the visibility clause to .where() as a Brackets instance, not a raw string', async () => {
        const qb = mockQb([]);

        await service.findAll();

        const [firstWhereArg]: [WhereArg] = qb.where.mock.calls[0] as [WhereArg];
        expect(firstWhereArg).toBeInstanceOf(Brackets);
        expect(typeof firstWhereArg).not.toBe('string');
      });

      it('the Brackets group ORs exactly the platform and approved-vendor terms', async () => {
        const qb = mockQb([]);

        await service.findAll();

        const [visibilityArg]: [WhereArg] = qb.where.mock.calls[0] as [WhereArg];
        const brackets = visibilityArg as Brackets;
        const innerPredicates = captureBracketPredicates(brackets);

        expect(innerPredicates).toHaveLength(2);
        expect(innerPredicates[0](platformProduct)).toBe(true);
        expect(innerPredicates[0](approvedVendorProduct)).toBe(false);
        expect(innerPredicates[1](approvedVendorProduct)).toBe(true);
        expect(innerPredicates[1](pendingVendorProduct)).toBe(false);
      });

      it('every subsequent predicate is registered via .andWhere, never .where', async () => {
        const qb = mockQb([]);

        await service.findAll({ categoryId: 'cat-gadgets', q: 'speaker', vendorId: 'v1' });

        expect(qb.where).toHaveBeenCalledTimes(1);
        expect(qb.andWhere).toHaveBeenCalledTimes(3);
      });

      it('[SQL-precedence fake] fails a platform listing against an unmatched category filter once bracketed (old raw-string code would incorrectly include it)', async () => {
        const sqlQb = buildSqlPrecedenceFakeQueryBuilder([platformGadget, pendingGadget]);
        productRepo.createQueryBuilder.mockReturnValue(sqlQb);

        // Neither product matches "Homeware" — platformGadget is tagged
        // Gadgets, pendingGadget's vendor is not approved. Under real SQL
        // precedence with an unbracketed visibility clause, the platform
        // listing would still be returned (it satisfies the bare `t1` OR
        // term), demonstrating the bug this guard is designed to catch.
        const result = await service.findAll({ categoryId: 'cat-homeware' });

        expect(result.items).toEqual([]);
        expect(sqlQb.getSql()).toContain(
          '(product.listingType = :platformType OR (product.listingType = :vendorType AND vendor.status = :approvedStatus))',
        );
      });

      it('[SQL-precedence fake] a platform listing still matches a satisfied filter (sanity check)', async () => {
        const sqlQb = buildSqlPrecedenceFakeQueryBuilder([platformGadget]);
        productRepo.createQueryBuilder.mockReturnValue(sqlQb);

        const result = await service.findAll({ categoryId: 'cat-gadgets' });

        expect(result.items.map((p) => p.id)).toEqual(['platform-gadget']);
      });
    });

    it('returns an empty array when the repository is empty', async () => {
      mockQb([]);

      const result = await service.findAll();

      expect(result.items).toEqual([]);
    });

    it('returns only PLATFORM and APPROVED-vendor listings from a mixed fixture set', async () => {
      mockQb(ALL_PRODUCTS);

      const result = await service.findAll();
      const ids = result.items.map((p) => p.id);

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
      const ids = result.items.map((p) => p.id);
      expect(ids).toEqual(
        expect.arrayContaining(['platform-gadget', 'approved-gadget', 'approved-homeware']),
      );
      expect(ids).not.toContain('pending-gadget');
    });

    it('filters by categoryId only', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ categoryId: 'cat-gadgets' });
      const ids = result.items.map((p) => p.id);

      expect(ids).toEqual(expect.arrayContaining(['platform-gadget', 'approved-gadget']));
      expect(ids).not.toContain('approved-homeware');
      // Non-approved vendor listing must never resurface even if it matches the category.
      expect(ids).not.toContain('pending-gadget');
    });

    it('returns an empty list for an unknown categoryId (not an error)', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ categoryId: 'does-not-exist' });

      expect(result.items).toEqual([]);
    });

    it('filters by q only (case-insensitive, matches name or description)', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ q: 'SPEAKER' });
      const ids = result.items.map((p) => p.id);

      expect(ids).toEqual(['approved-gadget']);
    });

    it('matches q against description as well as name', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ q: 'glazed' });
      const ids = result.items.map((p) => p.id);

      expect(ids).toEqual(['approved-homeware']);
    });

    it('filters by vendorId only', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ vendorId: 'v1' });
      const ids = result.items.map((p) => p.id);

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

      expect(result.items.map((p) => p.id)).toEqual(['approved-gadget']);
    });

    it('never resurfaces a non-approved vendor listing under any param combination', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const byCategory = await service.findAll({ categoryId: 'cat-gadgets' });
      const byQuery = await service.findAll({ q: 'charger' });
      const byVendor = await service.findAll({ vendorId: 'v2' });
      const combined = await service.findAll({ categoryId: 'cat-gadgets', q: 'charger' });

      expect(byCategory.items.map((p) => p.id)).not.toContain('pending-gadget');
      expect(byQuery.items.map((p) => p.id)).not.toContain('pending-gadget');
      expect(byVendor.items.map((p) => p.id)).not.toContain('pending-gadget');
      expect(combined.items.map((p) => p.id)).not.toContain('pending-gadget');
    });

    it('never resurfaces a non-approved vendor listing when pagination or sort params are combined with a filter', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const paged = await service.findAll({ categoryId: 'cat-gadgets', page: 1, limit: 1 });
      const sortedByPrice = await service.findAll({ vendorId: 'v2', sort: 'price_asc' });
      const pagedAndSorted = await service.findAll({
        q: 'charger',
        page: 1,
        limit: 10,
        sort: 'name',
      });

      expect(paged.items.map((p) => p.id)).not.toContain('pending-gadget');
      expect(sortedByPrice.items.map((p) => p.id)).not.toContain('pending-gadget');
      expect(pagedAndSorted.items.map((p) => p.id)).not.toContain('pending-gadget');
    });
  });

  describe('findAll — pagination and sort', () => {
    function mockQb(stored: Product[]) {
      const qb = buildFakeQueryBuilder(stored);
      productRepo.createQueryBuilder.mockReturnValue(qb);
      return qb;
    }

    it('applies the default page (1) and default limit (24) when omitted', async () => {
      const qb = mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll();

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(24);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(24);
    });

    it('clamps a limit above MAX_LIMIT (100) down to 100', async () => {
      const qb = mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ limit: 500 });

      expect(qb.take).toHaveBeenCalledWith(100);
      expect(result.limit).toBe(100);
    });

    it('computes skip/take from page and limit', async () => {
      const qb = mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ page: 3, limit: 2 });

      expect(qb.skip).toHaveBeenCalledWith(4); // (page - 1) * limit
      expect(qb.take).toHaveBeenCalledWith(2);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(2);
    });

    it('defaults to newest (createdAt DESC, id DESC tiebreak) when sort is omitted', async () => {
      const qb = mockQb(DISCOVERY_PRODUCTS);

      await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('product.createdAt', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('product.id', 'DESC');
    });

    it("applies 'newest' explicitly the same as the default", async () => {
      const qb = mockQb(DISCOVERY_PRODUCTS);

      await service.findAll({ sort: 'newest' });

      expect(qb.orderBy).toHaveBeenCalledWith('product.createdAt', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('product.id', 'DESC');
    });

    it("applies 'price_asc' with an id ASC tiebreaker", async () => {
      const qb = mockQb(DISCOVERY_PRODUCTS);

      await service.findAll({ sort: 'price_asc' });

      expect(qb.orderBy).toHaveBeenCalledWith('product.price', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('product.id', 'ASC');
    });

    it("applies 'price_desc' with an id DESC tiebreaker", async () => {
      const qb = mockQb(DISCOVERY_PRODUCTS);

      await service.findAll({ sort: 'price_desc' });

      expect(qb.orderBy).toHaveBeenCalledWith('product.price', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('product.id', 'DESC');
    });

    it("applies 'name' with an id ASC tiebreaker", async () => {
      const qb = mockQb(DISCOVERY_PRODUCTS);

      await service.findAll({ sort: 'name' });

      expect(qb.orderBy).toHaveBeenCalledWith('product.name', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('product.id', 'ASC');
    });

    it('slices the correct page of results for page=2', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      // 3 visible products (platform-gadget, approved-gadget, approved-homeware) sorted by name ASC.
      const page1 = await service.findAll({ sort: 'name', page: 1, limit: 2 });
      const page2 = await service.findAll({ sort: 'name', page: 2, limit: 2 });

      expect(page1.items).toHaveLength(2);
      expect(page2.items).toHaveLength(1);
      const allIds = [...page1.items, ...page2.items].map((p) => p.id);
      expect(allIds).toEqual(
        expect.arrayContaining(['platform-gadget', 'approved-gadget', 'approved-homeware']),
      );
      // No overlap between pages.
      expect(new Set(allIds).size).toBe(3);
    });

    it('reports total as the full match count, independent of the page slice', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ page: 1, limit: 1 });

      expect(result.items).toHaveLength(1);
      // 3 visible products total (platform-gadget, approved-gadget, approved-homeware);
      // pending-gadget is excluded by approved-vendor visibility, not by pagination.
      expect(result.total).toBe(3);
    });

    it('total reflects the AND-composed filters, not just visibility', async () => {
      mockQb(DISCOVERY_PRODUCTS);

      const result = await service.findAll({ categoryId: 'cat-gadgets', limit: 1 });

      expect(result.total).toBe(2); // platform-gadget + approved-gadget
      expect(result.items).toHaveLength(1);
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
