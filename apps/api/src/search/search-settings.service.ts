import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Meilisearch } from 'meilisearch';
import { MEILI_CLIENT, PRODUCTS_INDEX } from './search.constants';

/**
 * The ONE settings-write path for the products index. Called on boot, on
 * every full reindex, and whenever the admin saves a synonym — no other code
 * may write Meilisearch settings. Synonyms are injected per call so this
 * service stays the single writer while the synonyms module owns the data.
 */
@Injectable()
export class SearchSettingsService {
  private readonly logger = new Logger(SearchSettingsService.name);

  constructor(@Inject(MEILI_CLIENT) private readonly client: Meilisearch) {}

  async applySettings(synonyms: Record<string, string[]> = {}): Promise<void> {
    const index = this.client.index(PRODUCTS_INDEX);

    await index.updateSettings({
      // Field weighting: order IS the weight — name > description >
      // businessName > categoryNames.
      searchableAttributes: ['name', 'description', 'businessName', 'categoryNames'],
      filterableAttributes: [
        'categoryIds',
        'vendorId',
        'vendorStatus',
        'listingType',
        'price',
        'inStock',
        'originCountry',
      ],
      // currency is sortable so a price sort can group by currency first and
      // never interleave ZAR/NAD prices (peg is data, never an assumption).
      sortableAttributes: ['price', 'createdAt', 'currency'],
      // v1 business ranking after text relevance: inStock boost → recency →
      // price. salesVelocity/vendorRating are RESERVED no-op slots (resolved
      // spec question 1): no document carries these fields, so Meilisearch
      // treats every document equally on those rules until the backing data
      // exists. Do not remove them — their position encodes the agreed order.
      rankingRules: [
        'words',
        'typo',
        'proximity',
        'attribute',
        'sort',
        'exactness',
        'inStock:desc',
        'salesVelocity:desc', // reserved no-op — no sales-rollup data yet
        'vendorRating:desc', // reserved no-op — no ratings model yet
        'createdAt:desc',
        'price:asc',
      ],
      synonyms,
    });

    this.logger.log(
      `Applied products index settings (${Object.keys(synonyms).length} synonym terms)`,
    );
  }
}
