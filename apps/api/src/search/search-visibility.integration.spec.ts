import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import request from 'supertest';
import { App } from 'supertest/types';
import { CountryCode, CurrencyCode, ListingType, VendorStatus } from '@hb/shared';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ProductSearchService } from './product-search.service';
import { SearchIndexerService } from './search-indexer.service';
import { SearchSettingsService } from './search-settings.service';
import { SynonymsService } from './synonyms.service';
import { VendorsService } from '../vendors/vendors.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { FileUrlService } from '../products/upload/file-url.service';
import { Product } from '../products/entities/product.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { Category } from '../categories/entities/category.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { MEILI_CLIENT } from './search.constants';
import { mapProductToSearchDocument, ProductSearchDocument } from './search-document';

/**
 * Proves the card #50 acceptance guarantee end-to-end across BOTH
 * GET /search and GET /search/suggest, without needing a real running
 * Meilisearch (unavailable in this sandbox — Docker was down): a fake
 * in-memory Meilisearch client stands in for the engine, but every other
 * piece is the real, unmocked production wiring — VendorsService emits the
 * real vendor.status.changed event via a real EventEmitterModule, the real
 * SearchIndexerService listens and reconciles the index, and the real
 * ProductSearchService applies the real query-time visibility filter.
 *
 * The fake index applies exactly the one predicate our filter always
 * contains (vendorStatus = approved OR listingType = platform) — it is not
 * a general Meilisearch filter-language parser, since ProductSearchService's
 * own filter-STRING construction is already covered by product-search.
 * service.spec.ts. This test's job is proving the cross-service wiring: the
 * product disappears/reappears live, with no reindex call in between.
 */
class FakeMeiliIndex {
  private readonly docs = new Map<string, ProductSearchDocument>();

  addDocuments = jest.fn((docs: ProductSearchDocument[]) => {
    for (const doc of docs) this.docs.set(doc.id, doc);
    return Promise.resolve();
  });

  deleteDocument = jest.fn((id: string) => {
    this.docs.delete(id);
    return Promise.resolve();
  });

  deleteDocuments = jest.fn((ids: string[]) => {
    for (const id of ids) this.docs.delete(id);
    return Promise.resolve();
  });

  getDocuments = jest.fn(() => Promise.resolve({ results: [...this.docs.values()] }));

  updateSettings = jest.fn(() => Promise.resolve(undefined));

  search = jest.fn(
    (
      _q: string,
      opts: { filter?: string; limit?: number; offset?: number },
    ): Promise<{ hits: ProductSearchDocument[]; estimatedTotalHits: number }> => {
      // Every filter this service builds starts with this exact clause —
      // apply it directly rather than parsing the filter string.
      const visible = [...this.docs.values()].filter(
        (d) => d.vendorStatus === VendorStatus.APPROVED || d.listingType === ListingType.PLATFORM,
      );
      const offset = opts.offset ?? 0;
      const limit = opts.limit ?? visible.length;
      return Promise.resolve({
        hits: visible.slice(offset, offset + limit),
        estimatedTotalHits: visible.length,
      });
    },
  );
}

class FakeMeiliClient {
  readonly fakeIndex = new FakeMeiliIndex();
  index() {
    return this.fakeIndex;
  }
}

describe('Search visibility (integration): query-time approved-vendor gate, live', () => {
  let app: INestApplication<App>;
  let vendorsService: VendorsService;
  let fakeClient: FakeMeiliClient;

  const vendor: Vendor = {
    id: 'v1',
    businessName: 'Kalahari Naturals',
    status: VendorStatus.PENDING,
    countryCode: CountryCode.NAMIBIA,
  } as Vendor;

  const product: Product = {
    id: 'p1',
    name: 'Marula Face Serum',
    description: 'Cold-pressed marula oil serum',
    price: 399,
    currency: CurrencyCode.NAD,
    stockQuantity: 10,
    originCountry: CountryCode.NAMIBIA,
    listingType: ListingType.VENDOR,
    images: [],
    categories: [],
    vendor,
    vendorId: 'v1',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    fakeClient = new FakeMeiliClient();
    // These are shared const fixtures (referenced by closures below) —
    // reset mutable fields each test so vendorsService.updateStatus() in one
    // test can't leak vendor.status into the next.
    vendor.status = VendorStatus.PENDING;

    const productRepo = {
      findOne: jest.fn().mockResolvedValue(product),
      find: jest.fn().mockResolvedValue([product]),
    };
    const emptyQueryBuilder = () => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });

    const vendorRepo = {
      findOne: jest.fn().mockResolvedValue(vendor),
      save: jest.fn().mockImplementation((v: Vendor) => {
        Object.assign(vendor, v);
        return Promise.resolve(vendor);
      }),
      createQueryBuilder: jest.fn().mockImplementation(emptyQueryBuilder),
    };
    const categoryRepo = {
      findBy: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockImplementation(emptyQueryBuilder),
    };
    const orderItemRepo = { createQueryBuilder: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      controllers: [SearchController],
      providers: [
        SearchService,
        ProductSearchService,
        SearchIndexerService,
        SearchSettingsService,
        VendorsService,
        { provide: MEILI_CLIENT, useValue: fakeClient },
        {
          provide: SynonymsService,
          useValue: { buildMeilisearchSynonymsMap: jest.fn().mockResolvedValue({}) },
        },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepo },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        { provide: UsersService, useValue: { update: jest.fn() } },
        { provide: FileUrlService, useValue: { getFileUrl: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    vendorsService = moduleRef.get(VendorsService);
    await app.init();

    // Seed the fake index as the initial full-reindex would: the product IS
    // indexed even though its vendor is pending (index-time inclusion is
    // unconditional; approval is a query-time filter only).
    await fakeClient.fakeIndex.addDocuments([mapProductToSearchDocument(product)]);
  });

  afterEach(async () => {
    await app.close();
  });

  const flushMicrotasks = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  it("GET /search omits a pending vendor's product, then includes it right after approval — no reindex call", async () => {
    const before = await request(app.getHttpServer()).get('/search').expect(200);
    expect((before.body as { items: Array<{ id: string }> }).items.map((i) => i.id)).not.toContain(
      'p1',
    );

    await vendorsService.updateStatus('v1', VendorStatus.APPROVED);
    await flushMicrotasks();

    // The reconciliation happened via the vendor.status.changed event
    // listener upserting the existing doc — never a deleteDocuments/full
    // reindex call — proving the live, query-time nature of the gate.
    expect(fakeClient.fakeIndex.deleteDocuments).not.toHaveBeenCalled();

    const after = await request(app.getHttpServer()).get('/search').expect(200);
    expect((after.body as { items: Array<{ id: string }> }).items.map((i) => i.id)).toContain('p1');
  });

  it("GET /search/suggest omits a pending vendor's product, then includes it right after approval — no reindex call", async () => {
    const before = await request(app.getHttpServer())
      .get('/search/suggest')
      .query({ q: 'serum' })
      .expect(200);
    expect(
      (before.body as { products: Array<{ id: string }> }).products.map((p) => p.id),
    ).not.toContain('p1');

    await vendorsService.updateStatus('v1', VendorStatus.APPROVED);
    await flushMicrotasks();

    expect(fakeClient.fakeIndex.deleteDocuments).not.toHaveBeenCalled();

    const after = await request(app.getHttpServer())
      .get('/search/suggest')
      .query({ q: 'serum' })
      .expect(200);
    expect((after.body as { products: Array<{ id: string }> }).products.map((p) => p.id)).toContain(
      'p1',
    );
  });

  it('GET /search 400s on an invalid query param (whitelist + transform)', async () => {
    await request(app.getHttpServer()).get('/search').query({ sort: 'cheapestFirst' }).expect(400);
  });
});
