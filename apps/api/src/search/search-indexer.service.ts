import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import type { Meilisearch } from 'meilisearch';
import { Product } from '../products/entities/product.entity';
import { ProductEvents, VendorEvents } from '../common/events/domain-events';
import type { ProductChangedEvent, VendorStatusChangedEvent } from '../common/events/domain-events';
import { MEILI_CLIENT, PRODUCTS_INDEX } from './search.constants';
import { mapProductToSearchDocument } from './search-document';
import { SearchSettingsService } from './search-settings.service';
import { SynonymsService } from './synonyms.service';

const RELATIONS = ['vendor', 'categories', 'images'];

/**
 * Keeps the Meilisearch products index in sync with Postgres.
 *
 * - Event listeners give near-real-time upserts/deletes on product
 *   create/update/delete and reconcile every affected product doc on vendor
 *   status change (approve/suspend/reject).
 * - A daily full reindex is the sole AUTHORITATIVE rebuild path: it is
 *   idempotent (upserts every product, then prunes stale docs), safe to run
 *   under live traffic, and heals any event that was lost (process crash
 *   mid-write, transient Meilisearch outage, etc.) — the documented
 *   consistency guarantee since there is no durable queue in v1.
 * - Also runs once at boot: a fresh Meilisearch volume has no index settings
 *   (filterable/sortable attributes) until the first reindex applies them, so
 *   without this every query-time filter — including the approved-vendor
 *   visibility gate — fails until the next 3am cron. Idempotent, so this is
 *   safe on every restart, not just the first.
 * - Indexing failures are logged and swallowed: they must never break the
 *   originating Postgres write. The next daily reindex self-heals.
 */
@Injectable()
export class SearchIndexerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SearchIndexerService.name);

  constructor(
    @InjectRepository(Product) private readonly productRepository: Repository<Product>,
    @Inject(MEILI_CLIENT) private readonly client: Meilisearch,
    private readonly settingsService: SearchSettingsService,
    private readonly synonymsService: SynonymsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.safely('boot-time reindex', () => this.runFullReindex());
  }

  @OnEvent(ProductEvents.CREATED)
  @OnEvent(ProductEvents.UPDATED)
  async handleProductUpserted(event: ProductChangedEvent): Promise<void> {
    await this.safely(`upsert product ${event.productId}`, async () => {
      const product = await this.productRepository.findOne({
        where: { id: event.productId },
        relations: RELATIONS,
      });
      // Deleted between event emission and processing — nothing to upsert;
      // a delete event (or the daily reindex) will already have removed it.
      if (!product) return;

      const doc = mapProductToSearchDocument(product);
      await this.client.index(PRODUCTS_INDEX).addDocuments([doc], { primaryKey: 'id' });
    });
  }

  @OnEvent(ProductEvents.DELETED)
  async handleProductDeleted(event: ProductChangedEvent): Promise<void> {
    await this.safely(`delete product ${event.productId}`, async () => {
      await this.client.index(PRODUCTS_INDEX).deleteDocument(event.productId);
    });
  }

  /**
   * Vendor status changes do NOT gate index membership (query-time filter
   * only, resolved spec question 4) but the index copy of vendorStatus must
   * stay current so query-time filtering sees the right value immediately.
   */
  @OnEvent(VendorEvents.STATUS_CHANGED)
  async handleVendorStatusChanged(event: VendorStatusChangedEvent): Promise<void> {
    await this.safely(`reconcile vendor ${event.vendorId} products`, async () => {
      const products = await this.productRepository.find({
        where: { vendorId: event.vendorId },
        relations: RELATIONS,
      });
      if (!products.length) return;

      const docs = products.map((p) => mapProductToSearchDocument(p));
      await this.client.index(PRODUCTS_INDEX).addDocuments(docs, { primaryKey: 'id' });
    });
  }

  /**
   * The authoritative rebuild path. Idempotent: addDocuments upserts by
   * primary key, and any doc no longer in Postgres is pruned by id-set diff.
   * Safe under live traffic — Meilisearch serves the old docs until each
   * batch's indexing task completes.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async fullReindex(): Promise<void> {
    await this.safely('scheduled full reindex', () => this.runFullReindex());
  }

  async runFullReindex(): Promise<{ indexed: number; pruned: number }> {
    // Re-applies the full settings write (searchable/filterable/sortable
    // attributes, ranking rules, AND the current admin-edited synonyms map)
    // — the same shared path an admin save reuses (card #52), never a
    // second competing writer.
    const synonyms = await this.synonymsService.buildMeilisearchSynonymsMap();
    await this.settingsService.applySettings(synonyms);

    const products = await this.productRepository.find({ relations: RELATIONS });
    const docs = products.map((p) => mapProductToSearchDocument(p));

    const index = this.client.index(PRODUCTS_INDEX);
    if (docs.length) {
      await index.addDocuments(docs, { primaryKey: 'id' });
    }

    const liveIds = new Set(docs.map((d) => d.id));
    const staleIds = await this.findStaleDocumentIds(liveIds);
    if (staleIds.length) {
      await index.deleteDocuments(staleIds);
    }

    this.logger.log(`Full reindex complete: ${docs.length} indexed, ${staleIds.length} pruned`);
    return { indexed: docs.length, pruned: staleIds.length };
  }

  /** Pages through the index to find ids no longer present in Postgres. */
  private async findStaleDocumentIds(liveIds: Set<string>): Promise<string[]> {
    const index = this.client.index(PRODUCTS_INDEX);
    const stale: string[] = [];
    const pageSize = 1000;
    let offset = 0;

    while (true) {
      const page = await index.getDocuments({ limit: pageSize, offset, fields: ['id'] });
      const results = page.results as Array<{ id: string }>;
      if (!results.length) break;

      for (const doc of results) {
        if (!liveIds.has(doc.id)) stale.push(doc.id);
      }

      if (results.length < pageSize) break;
      offset += pageSize;
    }

    return stale;
  }

  private async safely(label: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      // Never let an indexing failure break the originating write path.
      // The next daily full reindex heals this document.
      this.logger.error(`Search indexing failed (${label}): ${(error as Error).message}`);
    }
  }
}
