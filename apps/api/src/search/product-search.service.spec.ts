import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  CountryCode,
  CurrencyCode,
  ListingType,
  ProductSearchSort,
  VendorStatus,
} from '@hb/shared';
import { ProductSearchService } from './product-search.service';
import { MEILI_CLIENT, PRODUCTS_INDEX, SUGGEST_LIMIT } from './search.constants';
import { Category } from '../categories/entities/category.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { ProductSearchDocument, PLATFORM_VENDOR_STATUS } from './search-document';

type SearchCall = [string, Record<string, unknown>];

const makeDoc = (overrides: Partial<ProductSearchDocument> = {}): ProductSearchDocument => ({
  id: 'p1',
  name: 'Vitamin C Serum',
  description: 'Brightening serum',
  businessName: null,
  vendorId: null,
  vendorStatus: PLATFORM_VENDOR_STATUS,
  listingType: ListingType.PLATFORM,
  price: 249.99,
  currency: CurrencyCode.ZAR,
  categoryIds: ['c1'],
  categoryNames: ['Skincare'],
  inStock: true,
  stockQuantity: 5,
  originCountry: CountryCode.SOUTH_AFRICA,
  createdAt: 1780000000,
  imageUrl: '/img/serum.jpg',
  ...overrides,
});

describe('ProductSearchService', () => {
  let service: ProductSearchService;
  let search: jest.Mock;
  let client: { index: jest.Mock };
  let categoryRepo: { findBy: jest.Mock };
  let vendorRepo: { findBy: jest.Mock };

  const defaultSearchResult = {
    hits: [] as ProductSearchDocument[],
    estimatedTotalHits: 0,
    facetDistribution: {},
    facetStats: {},
  };

  beforeEach(async () => {
    search = jest.fn().mockResolvedValue(defaultSearchResult);
    client = { index: jest.fn().mockReturnValue({ search }) };
    categoryRepo = { findBy: jest.fn().mockResolvedValue([]) };
    vendorRepo = { findBy: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        ProductSearchService,
        { provide: MEILI_CLIENT, useValue: client },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
      ],
    }).compile();

    service = module.get(ProductSearchService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('query-time leak-prevention guarantee', () => {
    // Mirrors card #36's test style: the approved-vendor-or-platform clause
    // must be present in the filter sent to Meilisearch on every call,
    // regardless of any other query params — this is what keeps a
    // suspended/pending/rejected vendor's product out of every result set.
    const approvedOrPlatform = `(vendorStatus = "${VendorStatus.APPROVED}" OR listingType = "${ListingType.PLATFORM}")`;

    it.each([
      {},
      { categoryId: 'c1' },
      { vendorId: 'v1' },
      { minPrice: 10 },
      { maxPrice: 100 },
      { minPrice: 10, maxPrice: 100 },
      { inStockOnly: true },
      {
        q: 'serum',
        categoryId: 'c1',
        vendorId: 'v1',
        minPrice: 1,
        maxPrice: 999,
        inStockOnly: true,
      },
    ])('includes the approved-vendor-or-platform filter for query %j', async (query) => {
      await service.search(query);

      const options = (search.mock.calls[0] as SearchCall)[1] as { filter: string };
      expect(options.filter.startsWith(approvedOrPlatform)).toBe(true);
    });

    it('includes the same filter clause for suggest()', async () => {
      await service.suggest('serum');

      const options = (search.mock.calls[0] as SearchCall)[1] as { filter: string };
      expect(options.filter).toBe(approvedOrPlatform);
    });
  });

  describe('filter composition (AND)', () => {
    it('composes categoryId, vendorId, price range, and inStockOnly onto the base filter', async () => {
      await service.search({
        categoryId: 'cat-1',
        vendorId: 'vend-1',
        minPrice: 50,
        maxPrice: 500,
        inStockOnly: true,
      });

      const options = (search.mock.calls[0] as SearchCall)[1] as { filter: string };
      expect(options.filter).toBe(
        '(vendorStatus = "approved" OR listingType = "platform") AND ' +
          'categoryIds = "cat-1" AND vendorId = "vend-1" AND price >= 50 AND price <= 500 AND inStock = true',
      );
    });

    it('omits clauses for params that are absent', async () => {
      await service.search({});

      const options = (search.mock.calls[0] as SearchCall)[1] as { filter: string };
      expect(options.filter).toBe('(vendorStatus = "approved" OR listingType = "platform")');
    });
  });

  describe('sort', () => {
    it('sorts by currency then price ascending for priceAsc', async () => {
      await service.search({ sort: ProductSearchSort.PRICE_ASC });
      const options = (search.mock.calls[0] as SearchCall)[1] as { sort?: string[] };
      expect(options.sort).toEqual(['currency:asc', 'price:asc']);
    });

    it('sorts by currency then price descending for priceDesc (never interleaving ZAR/NAD)', async () => {
      await service.search({ sort: ProductSearchSort.PRICE_DESC });
      const options = (search.mock.calls[0] as SearchCall)[1] as { sort?: string[] };
      expect(options.sort).toEqual(['currency:asc', 'price:desc']);
    });

    it('sorts by createdAt descending for newest', async () => {
      await service.search({ sort: ProductSearchSort.NEWEST });
      const options = (search.mock.calls[0] as SearchCall)[1] as { sort?: string[] };
      expect(options.sort).toEqual(['createdAt:desc']);
    });

    it('omits an explicit sort for relevance (default), relying on index ranking rules', async () => {
      await service.search({ sort: ProductSearchSort.RELEVANCE });
      const options = (search.mock.calls[0] as SearchCall)[1] as { sort?: string[] };
      expect(options.sort).toBeUndefined();
    });

    it('omits an explicit sort when no sort is given at all', async () => {
      await service.search({});
      const options = (search.mock.calls[0] as SearchCall)[1] as { sort?: string[] };
      expect(options.sort).toBeUndefined();
    });
  });

  describe('pagination', () => {
    it('defaults to page 1 / pageSize 20 and computes offset 0', async () => {
      await service.search({});
      const options = (search.mock.calls[0] as SearchCall)[1] as { offset: number; limit: number };
      expect(options.offset).toBe(0);
      expect(options.limit).toBe(20);
    });

    it('computes offset from page and pageSize', async () => {
      await service.search({ page: 3, pageSize: 10 });
      const options = (search.mock.calls[0] as SearchCall)[1] as { offset: number; limit: number };
      expect(options.offset).toBe(20);
      expect(options.limit).toBe(10);
    });

    it('echoes page/pageSize/total in the response', async () => {
      search.mockResolvedValue({
        ...defaultSearchResult,
        hits: [makeDoc()],
        estimatedTotalHits: 42,
      });

      const result = await service.search({ page: 2, pageSize: 10 });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
      expect(result.total).toBe(42);
    });
  });

  describe('empty query / no-results paths', () => {
    it('passes an empty string to Meilisearch when q is absent (browse-all)', async () => {
      await service.search({});
      expect(search).toHaveBeenCalledWith('', expect.anything());
    });

    it('trims the query and echoes the trimmed value back', async () => {
      search.mockResolvedValue(defaultSearchResult);
      const result = await service.search({ q: '  serum  ' });

      expect(search).toHaveBeenCalledWith('serum', expect.anything());
      expect(result.query).toBe('serum');
    });

    it('returns an empty items array, zero total, and a null priceRange when there are no hits', async () => {
      const result = await service.search({ q: 'nonexistent-thing' });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.facets.priceRange).toBeNull();
      expect(result.facets.categories).toEqual([]);
      expect(result.facets.vendors).toEqual([]);
    });
  });

  describe('result mapping', () => {
    it('maps a hit to a ProductSearchResultItem carrying price and currency together', async () => {
      const doc = makeDoc({
        id: 'p-vendor',
        listingType: ListingType.VENDOR,
        vendorId: 'v1',
        businessName: 'Kalahari Naturals',
        vendorStatus: VendorStatus.APPROVED,
        price: 399,
        currency: CurrencyCode.NAD,
      });
      search.mockResolvedValue({ ...defaultSearchResult, hits: [doc], estimatedTotalHits: 1 });

      const result = await service.search({});

      expect(result.items).toEqual([
        {
          id: 'p-vendor',
          name: doc.name,
          price: 399,
          currency: CurrencyCode.NAD,
          inStock: true,
          listingType: ListingType.VENDOR,
          vendorId: 'v1',
          businessName: 'Kalahari Naturals',
          imageUrl: doc.imageUrl,
          categoryIds: doc.categoryIds,
          createdAt: new Date(doc.createdAt * 1000).toISOString(),
        },
      ]);
    });

    it('carries null vendor fields through for a platform listing', async () => {
      const doc = makeDoc();
      search.mockResolvedValue({ ...defaultSearchResult, hits: [doc], estimatedTotalHits: 1 });

      const result = await service.search({});

      expect(result.items[0].vendorId).toBeNull();
      expect(result.items[0].businessName).toBeNull();
    });
  });

  describe('facets', () => {
    it('resolves category facet ids to names via the category repository', async () => {
      search.mockResolvedValue({
        ...defaultSearchResult,
        facetDistribution: { categoryIds: { c1: 3, c2: 1 } },
      });
      categoryRepo.findBy.mockResolvedValue([
        { id: 'c1', name: 'Skincare' },
        { id: 'c2', name: 'Haircare' },
      ]);

      const result = await service.search({});

      expect(result.facets.categories).toEqual(
        expect.arrayContaining([
          { id: 'c1', name: 'Skincare', count: 3 },
          { id: 'c2', name: 'Haircare', count: 1 },
        ]),
      );
    });

    it('resolves vendor facet ids to businessName via the vendor repository', async () => {
      search.mockResolvedValue({
        ...defaultSearchResult,
        facetDistribution: { vendorId: { v1: 2 } },
      });
      vendorRepo.findBy.mockResolvedValue([{ id: 'v1', businessName: 'Kalahari Naturals' }]);

      const result = await service.search({});

      expect(result.facets.vendors).toEqual([{ id: 'v1', name: 'Kalahari Naturals', count: 2 }]);
    });

    it('maps facetStats.price to a priceRange', async () => {
      search.mockResolvedValue({
        ...defaultSearchResult,
        facetStats: { price: { min: 50, max: 500 } },
      });

      const result = await service.search({});

      expect(result.facets.priceRange).toEqual({ min: 50, max: 500 });
    });
  });

  describe('suggest', () => {
    it('caps results via the SUGGEST_LIMIT constant', async () => {
      await service.suggest('serum');

      const options = (search.mock.calls[0] as SearchCall)[1] as { limit: number };
      expect(options.limit).toBe(SUGGEST_LIMIT);
    });

    it('maps hits to the omnibox ProductSuggestion shape (vendorName, not businessName)', async () => {
      const doc = makeDoc({ businessName: 'Kalahari Naturals' });
      search.mockResolvedValue({ ...defaultSearchResult, hits: [doc] });

      const result = await service.suggest('serum');

      expect(result).toEqual([
        {
          id: doc.id,
          name: doc.name,
          price: doc.price,
          currency: doc.currency,
          imageUrl: doc.imageUrl,
          vendorName: 'Kalahari Naturals',
        },
      ]);
    });

    it('queries the products index', async () => {
      await service.suggest('serum');
      expect(client.index).toHaveBeenCalledWith(PRODUCTS_INDEX);
    });
  });
});
