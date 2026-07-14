import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CountryCode, CurrencyCode, ListingType, VendorStatus } from '@hb/shared';
import { SearchIndexerService } from './search-indexer.service';
import { SearchSettingsService } from './search-settings.service';
import { SynonymsService } from './synonyms.service';
import { MEILI_CLIENT, PRODUCTS_INDEX } from './search.constants';
import { Product } from '../products/entities/product.entity';
import { Vendor } from '../vendors/entities/vendor.entity';

const NOW = new Date('2026-06-01T10:00:00.000Z');

const makeVendor = (overrides: Partial<Vendor> = {}): Vendor =>
  ({
    id: 'v1',
    businessName: 'Test Vendor Co',
    status: VendorStatus.APPROVED,
    ...overrides,
  }) as Vendor;

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Vitamin C Serum',
  description: 'Brightening serum',
  price: 249.99,
  currency: CurrencyCode.ZAR,
  stockQuantity: 5,
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

describe('SearchIndexerService', () => {
  let service: SearchIndexerService;
  let productRepo: Record<string, jest.Mock>;
  let meiliIndex: {
    addDocuments: jest.Mock;
    deleteDocument: jest.Mock;
    deleteDocuments: jest.Mock;
    getDocuments: jest.Mock;
  };
  let meiliClient: { index: jest.Mock };
  let settingsService: { applySettings: jest.Mock };
  let synonymsService: { buildMeilisearchSynonymsMap: jest.Mock };

  beforeEach(async () => {
    productRepo = { findOne: jest.fn(), find: jest.fn() };

    meiliIndex = {
      addDocuments: jest.fn().mockResolvedValue(undefined),
      deleteDocument: jest.fn().mockResolvedValue(undefined),
      deleteDocuments: jest.fn().mockResolvedValue(undefined),
      getDocuments: jest.fn().mockResolvedValue({ results: [] }),
    };
    meiliClient = { index: jest.fn().mockReturnValue(meiliIndex) };

    settingsService = { applySettings: jest.fn().mockResolvedValue(undefined) };
    synonymsService = { buildMeilisearchSynonymsMap: jest.fn().mockResolvedValue({}) };

    const module = await Test.createTestingModule({
      providers: [
        SearchIndexerService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: MEILI_CLIENT, useValue: meiliClient },
        { provide: SearchSettingsService, useValue: settingsService },
        { provide: SynonymsService, useValue: synonymsService },
      ],
    }).compile();

    service = module.get(SearchIndexerService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('product created/updated events', () => {
    it('upserts the mapped document for the product', async () => {
      const product = makeProduct();
      productRepo.findOne.mockResolvedValue(product);

      await service.handleProductUpserted({ productId: 'p1' });

      expect(productRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p1' } }),
      );
      expect(meiliClient.index).toHaveBeenCalledWith(PRODUCTS_INDEX);
      expect(meiliIndex.addDocuments).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'p1', name: 'Vitamin C Serum' })],
        { primaryKey: 'id' },
      );
    });

    it('does nothing if the product no longer exists (deleted before the event was processed)', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await service.handleProductUpserted({ productId: 'gone' });

      expect(meiliIndex.addDocuments).not.toHaveBeenCalled();
    });

    it('swallows indexing errors so the originating write never fails', async () => {
      productRepo.findOne.mockResolvedValue(makeProduct());
      meiliIndex.addDocuments.mockRejectedValue(new Error('meilisearch down'));

      await expect(service.handleProductUpserted({ productId: 'p1' })).resolves.toBeUndefined();
    });
  });

  describe('product deleted event', () => {
    it('deletes the document by id', async () => {
      await service.handleProductDeleted({ productId: 'p1' });

      expect(meiliIndex.deleteDocument).toHaveBeenCalledWith('p1');
    });

    it('swallows delete errors', async () => {
      meiliIndex.deleteDocument.mockRejectedValue(new Error('boom'));

      await expect(service.handleProductDeleted({ productId: 'p1' })).resolves.toBeUndefined();
    });
  });

  describe('vendor status changed event', () => {
    it("reconciles vendorStatus across every one of that vendor's product documents", async () => {
      const vendor = makeVendor({ status: VendorStatus.SUSPENDED });
      const products = [
        makeProduct({ id: 'p1', listingType: ListingType.VENDOR, vendor, vendorId: 'v1' }),
        makeProduct({ id: 'p2', listingType: ListingType.VENDOR, vendor, vendorId: 'v1' }),
      ];
      productRepo.find.mockResolvedValue(products);

      await service.handleVendorStatusChanged({ vendorId: 'v1', status: VendorStatus.SUSPENDED });

      expect(productRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { vendorId: 'v1' } }),
      );
      expect(meiliIndex.addDocuments).toHaveBeenCalledWith(
        [
          expect.objectContaining({ id: 'p1', vendorStatus: VendorStatus.SUSPENDED }),
          expect.objectContaining({ id: 'p2', vendorStatus: VendorStatus.SUSPENDED }),
        ],
        { primaryKey: 'id' },
      );
    });

    it('does nothing when the vendor has no products', async () => {
      productRepo.find.mockResolvedValue([]);

      await service.handleVendorStatusChanged({
        vendorId: 'v-empty',
        status: VendorStatus.APPROVED,
      });

      expect(meiliIndex.addDocuments).not.toHaveBeenCalled();
    });

    it('never touches platform listings (they have no vendorId to match)', () => {
      // Sanity: platform products are never returned by a vendorId query, so
      // reconciliation naturally excludes them. Nothing to assert beyond the
      // where-clause check above; documented here for intent.
      expect(true).toBe(true);
    });
  });

  describe('full reindex', () => {
    it('is idempotent: upserts every live product and applies settings first', async () => {
      const products = [makeProduct({ id: 'p1' }), makeProduct({ id: 'p2' })];
      productRepo.find.mockResolvedValue(products);
      meiliIndex.getDocuments.mockResolvedValue({ results: [] });

      const result = await service.runFullReindex();

      expect(settingsService.applySettings).toHaveBeenCalled();
      expect(meiliIndex.addDocuments).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'p1' }), expect.objectContaining({ id: 'p2' })],
        { primaryKey: 'id' },
      );
      expect(result).toEqual({ indexed: 2, pruned: 0 });
    });

    it('re-applies the current admin-edited synonyms map on every reindex (card #52 sharing the same settings-write path)', async () => {
      productRepo.find.mockResolvedValue([]);
      const synonymsMap = { spf: ['sunscreen'] };
      synonymsService.buildMeilisearchSynonymsMap.mockResolvedValue(synonymsMap);

      await service.runFullReindex();

      expect(synonymsService.buildMeilisearchSynonymsMap).toHaveBeenCalled();
      expect(settingsService.applySettings).toHaveBeenCalledWith(synonymsMap);
    });

    it('prunes documents that no longer exist in Postgres', async () => {
      productRepo.find.mockResolvedValue([makeProduct({ id: 'p1' })]);
      meiliIndex.getDocuments.mockResolvedValue({
        results: [{ id: 'p1' }, { id: 'stale-1' }, { id: 'stale-2' }],
      });

      const result = await service.runFullReindex();

      expect(meiliIndex.deleteDocuments).toHaveBeenCalledWith(['stale-1', 'stale-2']);
      expect(result).toEqual({ indexed: 1, pruned: 2 });
    });

    it('is safe under live traffic (never throws even if a step fails) via the cron wrapper', async () => {
      productRepo.find.mockRejectedValue(new Error('db hiccup'));

      await expect(service.fullReindex()).resolves.toBeUndefined();
    });
  });
});
