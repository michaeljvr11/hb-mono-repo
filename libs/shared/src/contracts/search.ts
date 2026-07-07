import { CountryCode, CurrencyCode, ListingType, ProductSearchSort } from '../enums';

/** Query for the unified storefront omnibox (GET /search/suggest). */
export interface SearchSuggestQuery {
  q: string;
}

export interface ProductSuggestion {
  id: string;
  name: string;
  price: number;
  currency: CurrencyCode;
  imageUrl: string | null;
  /** Absent on platform (first-party) listings. */
  vendorName: string | null;
}

export interface VendorSuggestion {
  id: string;
  businessName: string;
  countryCode: CountryCode | null;
}

export interface CategorySuggestion {
  id: string;
  name: string;
  /** Nullable at the entity level; always populated in practice (auto-generated on create). */
  slug: string | null;
}

/** Grouped, capped (top 5 per group) results for the search omnibox. */
export interface SearchSuggestions {
  products: ProductSuggestion[];
  vendors: VendorSuggestion[];
  categories: CategorySuggestion[];
}

// ─── Product search engine (Meilisearch-backed GET /search) ─────────────────
// These coexist with the omnibox types above — do not merge or rename them.
// The engine's suggest path deliberately REUSES the omnibox contract:
// `SearchSuggestQuery` is the input and the engine feeds the `products` group
// of `SearchSuggestions` with `ProductSuggestion` items. No parallel suggest
// shape exists on purpose (resolved spec open-question 6).

/** Query params for GET /search — all optional, all AND-composed. */
export interface ProductSearchQuery {
  /** Full-text query (typo-tolerant). Empty/absent = browse all. */
  q?: string;
  categoryId?: string;
  vendorId?: string;
  /** Inclusive lower price bound (same-currency comparison, see facets). */
  minPrice?: number;
  /** Inclusive upper price bound. */
  maxPrice?: number;
  inStockOnly?: boolean;
  /** 1-based page number. */
  page?: number;
  pageSize?: number;
  sort?: ProductSearchSort;
}

/** One search hit. price and currency always travel together. */
export interface ProductSearchResultItem {
  id: string;
  name: string;
  price: number;
  currency: CurrencyCode;
  inStock: boolean;
  listingType: ListingType;
  /** Null on platform (first-party) listings. */
  vendorId: string | null;
  /** Null on platform (first-party) listings. */
  businessName: string | null;
  imageUrl: string | null;
  categoryIds: string[];
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface ProductSearchFacetValue {
  id: string;
  name: string;
  count: number;
}

export interface ProductSearchPriceRange {
  min: number;
  max: number;
}

/** Facet counts for the current result set (filters AND-compose). */
export interface ProductSearchFacets {
  categories: ProductSearchFacetValue[];
  vendors: ProductSearchFacetValue[];
  /** Null when the result set has no priced hits. */
  priceRange: ProductSearchPriceRange | null;
}

export interface ProductSearchResponse {
  items: ProductSearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
  facets: ProductSearchFacets;
  /** Echo of the (trimmed) text query this response answered. */
  query: string;
}
