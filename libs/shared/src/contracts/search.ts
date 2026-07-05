import { CountryCode, CurrencyCode } from '../enums';

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
