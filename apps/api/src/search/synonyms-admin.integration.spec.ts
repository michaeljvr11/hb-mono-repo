import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { CountryCode, CurrencyCode, ListingType, UserRole } from '@hb/shared';
import { RolesGuard } from '../common/guards/roles.guard';
import { SynonymsController } from './synonyms.controller';
import { SynonymsService } from './synonyms.service';
import { SearchSettingsService } from './search-settings.service';
import { ProductSearchService } from './product-search.service';
import { Synonym } from './entities/synonym.entity';
import { Category } from '../categories/entities/category.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { MEILI_CLIENT } from './search.constants';
import { ProductSearchDocument } from './search-document';

/**
 * Proves card #52's two acceptance criteria end-to-end, without a real
 * running Meilisearch (Docker was unavailable in this sandbox — the client
 * is faked, but the admin guard, DTO validation, SynonymsService, and
 * ProductSearchService are all real, unmocked production code):
 *
 * 1. A non-admin is rejected from the synonyms admin endpoint.
 * 2. Saving a synonym via the admin endpoint reloads the live Meilisearch
 *    synonyms setting, and a subsequent product search for one variant
 *    ("spf") finds a product only indexed under the other ("sunscreen").
 *
 * Authentication itself is faked (a lightweight test guard reading a
 * `x-test-role` header) since wiring the full JWT/passport stack isn't the
 * point of this test — the REAL RolesGuard (@Roles(UserRole.ADMIN) on
 * SynonymsController) is what's under test here.
 */
@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ user?: { role: UserRole }; headers: Record<string, string> }>();
    const role = req.headers['x-test-role'] as UserRole | undefined;
    if (role) req.user = { role };
    return true;
  }
}

class FakeSynonymAwareIndex {
  private readonly docs = new Map<string, ProductSearchDocument>();
  private synonyms: Record<string, string[]> = {};

  updateSettings = jest.fn((settings: { synonyms?: Record<string, string[]> }) => {
    if (settings.synonyms) this.synonyms = settings.synonyms;
    return Promise.resolve();
  });

  addDocuments = jest.fn((docs: ProductSearchDocument[]) => {
    for (const doc of docs) this.docs.set(doc.id, doc);
    return Promise.resolve();
  });

  search = jest.fn(
    (q: string): Promise<{ hits: ProductSearchDocument[]; estimatedTotalHits: number }> => {
      const qLower = q.trim().toLowerCase();
      const expansions = qLower ? [qLower, ...(this.synonyms[qLower] ?? [])] : [''];

      const hits = [...this.docs.values()].filter((d) => {
        if (!qLower) return true;
        const haystack = `${d.name} ${d.description}`.toLowerCase();
        return expansions.some((term) => haystack.includes(term));
      });

      return Promise.resolve({ hits, estimatedTotalHits: hits.length });
    },
  );
}

class FakeMeiliClient {
  readonly fakeIndex = new FakeSynonymAwareIndex();
  index() {
    return this.fakeIndex;
  }
}

describe('Synonyms admin (integration): permission gate + live search reload', () => {
  let app: INestApplication<App>;
  let fakeClient: FakeMeiliClient;

  const product: ProductSearchDocument = {
    id: 'p1',
    name: 'Daily Face Lotion',
    description: 'Broad-spectrum sunscreen lotion for everyday use',
    businessName: null,
    vendorId: null,
    vendorStatus: 'platform',
    listingType: ListingType.PLATFORM,
    price: 185,
    currency: CurrencyCode.ZAR,
    categoryIds: [],
    categoryNames: [],
    inStock: true,
    stockQuantity: 20,
    originCountry: CountryCode.SOUTH_AFRICA,
    createdAt: Math.floor(Date.now() / 1000),
    imageUrl: null,
  };

  beforeEach(async () => {
    fakeClient = new FakeMeiliClient();
    await fakeClient.fakeIndex.addDocuments([product]);

    // A minimal in-memory store so buildMeilisearchSynonymsMap() (which
    // calls repo.find()) actually reflects rows created via the endpoint —
    // a constant [] mock would make the reload always apply an empty map.
    const stored: Synonym[] = [];
    const synonymRepo = {
      find: jest.fn().mockImplementation(() => Promise.resolve([...stored])),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data: Partial<Synonym>) => data as Synonym),
      save: jest.fn().mockImplementation((s: Synonym) => {
        const saved = { id: 's1', createdAt: new Date(), updatedAt: new Date(), ...s };
        stored.push(saved);
        return Promise.resolve(saved);
      }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const categoryRepo = { findBy: jest.fn().mockResolvedValue([]) };
    const vendorRepo = { findBy: jest.fn().mockResolvedValue([]) };

    const moduleRef = await Test.createTestingModule({
      controllers: [SynonymsController],
      providers: [
        SynonymsService,
        ProductSearchService,
        SearchSettingsService,
        { provide: MEILI_CLIENT, useValue: fakeClient },
        { provide: getRepositoryToken(Synonym), useValue: synonymRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(Vendor), useValue: vendorRepo },
        { provide: APP_GUARD, useClass: FakeAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('permission gate', () => {
    it('rejects a request with no authenticated user', async () => {
      await request(app.getHttpServer())
        .post('/admin/search/synonyms')
        .send({ term: 'spf', equivalents: ['sunscreen'] })
        .expect(403);
    });

    it('rejects a non-admin (customer) user', async () => {
      await request(app.getHttpServer())
        .post('/admin/search/synonyms')
        .set('x-test-role', UserRole.CUSTOMER)
        .send({ term: 'spf', equivalents: ['sunscreen'] })
        .expect(403);
    });

    it('allows an admin user', async () => {
      await request(app.getHttpServer())
        .post('/admin/search/synonyms')
        .set('x-test-role', UserRole.ADMIN)
        .send({ term: 'spf', equivalents: ['sunscreen'] })
        .expect(201);
    });
  });

  it('saving a synonym via the admin endpoint makes one variant find products indexed under the other', async () => {
    const product2Search = new ProductSearchService(
      fakeClient as never,
      { findBy: jest.fn().mockResolvedValue([]) } as never,
      { findBy: jest.fn().mockResolvedValue([]) } as never,
    );

    const before = await product2Search.search({ q: 'spf' });
    expect(before.items.map((i) => i.id)).not.toContain('p1');

    await request(app.getHttpServer())
      .post('/admin/search/synonyms')
      .set('x-test-role', UserRole.ADMIN)
      .send({ term: 'spf', equivalents: ['sunscreen'], bidirectional: true })
      .expect(201);

    const after = await product2Search.search({ q: 'spf' });
    expect(after.items.map((i) => i.id)).toContain('p1');
  });
});
