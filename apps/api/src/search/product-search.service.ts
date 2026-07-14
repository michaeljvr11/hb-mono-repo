import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { Meilisearch } from 'meilisearch';
import {
  ListingType,
  ProductSearchFacetValue,
  ProductSearchFacets,
  ProductSearchQuery,
  ProductSearchResponse,
  ProductSearchResultItem,
  ProductSearchSort,
  ProductSuggestion,
  VendorStatus,
} from '@hb/shared';
import { Category } from '../categories/entities/category.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { MEILI_CLIENT, PRODUCTS_INDEX, SUGGEST_LIMIT } from './search.constants';
import { ProductSearchDocument } from './search-document';
import { SEARCH_DEFAULT_PAGE_SIZE } from './dto/product-search-query.dto';

/**
 * Every /search and /search/suggest query applies this filter, no exceptions.
 * A pending/rejected/suspended vendor's product must never surface regardless
 * of any other param — this is the query-time equivalent of card #36's
 * ProductsService.findAll guarantee, enforced by Meilisearch itself (never
 * an index-time exclusion, per the resolved spec open question).
 */
const APPROVED_VENDOR_OR_PLATFORM_FILTER = `(vendorStatus = "${VendorStatus.APPROVED}" OR listingType = "${ListingType.PLATFORM}")`;

interface RawFacetDistribution {
  categoryIds?: Record<string, number>;
  vendorId?: Record<string, number>;
}

interface RawFacetStats {
  price?: { min: number; max: number };
}

/**
 * The Meilisearch-backed product search engine: typo-tolerant full-text
 * search, business ranking, faceted filters, and prefix suggest. Field
 * weighting and ranking rules are static index config (see
 * SearchSettingsService) — this service only builds the per-query
 * filter/sort and maps the response.
 */
@Injectable()
export class ProductSearchService {
  constructor(
    @Inject(MEILI_CLIENT) private readonly client: Meilisearch,
    @InjectRepository(Category) private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Vendor) private readonly vendorRepository: Repository<Vendor>,
  ) {}

  async search(query: ProductSearchQuery): Promise<ProductSearchResponse> {
    const trimmedQuery = (query.q ?? '').trim();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? SEARCH_DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    const filter = this.buildFilter(query);
    const sort = this.buildSort(query.sort);

    const raw = await this.client
      .index(PRODUCTS_INDEX)
      .search<ProductSearchDocument>(trimmedQuery, {
        filter,
        sort,
        offset,
        limit: pageSize,
        facets: ['categoryIds', 'vendorId', 'price'],
      });

    const items: ProductSearchResultItem[] = raw.hits.map((hit) => ({
      id: hit.id,
      name: hit.name,
      price: hit.price,
      currency: hit.currency,
      inStock: hit.inStock,
      listingType: hit.listingType,
      vendorId: hit.vendorId,
      businessName: hit.businessName,
      imageUrl: hit.imageUrl,
      categoryIds: hit.categoryIds,
      createdAt: new Date(hit.createdAt * 1000).toISOString(),
    }));

    const facets = await this.buildFacets(raw.facetDistribution ?? {}, raw.facetStats ?? {});

    return {
      items,
      total: raw.estimatedTotalHits ?? raw.hits.length,
      page,
      pageSize,
      facets,
      query: trimmedQuery,
    };
  }

  /** Small capped prefix suggest, feeding the omnibox's `products` group. */
  async suggest(q: string): Promise<ProductSuggestion[]> {
    const raw = await this.client.index(PRODUCTS_INDEX).search<ProductSearchDocument>(q, {
      filter: APPROVED_VENDOR_OR_PLATFORM_FILTER,
      limit: SUGGEST_LIMIT,
    });

    return raw.hits.map((hit) => ({
      id: hit.id,
      name: hit.name,
      price: hit.price,
      currency: hit.currency,
      imageUrl: hit.imageUrl,
      vendorName: hit.businessName,
    }));
  }

  /**
   * Approved-vendor visibility is always the first AND-operand; every other
   * filter composes onto it (categoryId, vendorId, price range, inStockOnly).
   */
  private buildFilter(query: ProductSearchQuery): string {
    const clauses = [APPROVED_VENDOR_OR_PLATFORM_FILTER];

    if (query.categoryId) clauses.push(`categoryIds = "${query.categoryId}"`);
    if (query.vendorId) clauses.push(`vendorId = "${query.vendorId}"`);
    if (query.minPrice !== undefined) clauses.push(`price >= ${query.minPrice}`);
    if (query.maxPrice !== undefined) clauses.push(`price <= ${query.maxPrice}`);
    if (query.inStockOnly) clauses.push('inStock = true');

    return clauses.join(' AND ');
  }

  /**
   * Price sort always groups by currency first so ZAR and NAD amounts are
   * never interleaved (the peg is data, never an arithmetic assumption).
   * `relevance` (the default) omits an explicit sort and relies entirely on
   * the index's ranking rules (text relevance -> inStock -> recency -> price).
   */
  private buildSort(sort?: ProductSearchSort): string[] | undefined {
    switch (sort) {
      case ProductSearchSort.PRICE_ASC:
        return ['currency:asc', 'price:asc'];
      case ProductSearchSort.PRICE_DESC:
        return ['currency:asc', 'price:desc'];
      case ProductSearchSort.NEWEST:
        return ['createdAt:desc'];
      default:
        return undefined;
    }
  }

  private async buildFacets(
    distribution: RawFacetDistribution,
    stats: RawFacetStats,
  ): Promise<ProductSearchFacets> {
    const [categories, vendors] = await Promise.all([
      this.resolveCategoryFacets(distribution.categoryIds ?? {}),
      this.resolveVendorFacets(distribution.vendorId ?? {}),
    ]);

    const priceRange = stats.price ? { min: stats.price.min, max: stats.price.max } : null;

    return { categories, vendors, priceRange };
  }

  private async resolveCategoryFacets(
    counts: Record<string, number>,
  ): Promise<ProductSearchFacetValue[]> {
    const ids = Object.keys(counts);
    if (!ids.length) return [];

    const categories = await this.categoryRepository.findBy({ id: In(ids) });
    const nameById = new Map(categories.map((c) => [c.id, c.name]));

    return ids
      .filter((id) => nameById.has(id))
      .map((id) => ({ id, name: nameById.get(id), count: counts[id] }));
  }

  private async resolveVendorFacets(
    counts: Record<string, number>,
  ): Promise<ProductSearchFacetValue[]> {
    const ids = Object.keys(counts);
    if (!ids.length) return [];

    const vendors = await this.vendorRepository.findBy({ id: In(ids) });
    const nameById = new Map(vendors.map((v) => [v.id, v.businessName]));

    return ids
      .filter((id) => nameById.has(id))
      .map((id) => ({ id, name: nameById.get(id), count: counts[id] }));
  }
}
