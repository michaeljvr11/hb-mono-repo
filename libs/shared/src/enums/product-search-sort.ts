/**
 * Sort orders for the product search engine (GET /search).
 * `relevance` is the default: Meilisearch text relevance + the business
 * ranking rules (inStock boost → recency → price).
 */
export const ProductSearchSort = {
  RELEVANCE: 'relevance',
  PRICE_ASC: 'priceAsc',
  PRICE_DESC: 'priceDesc',
  NEWEST: 'newest',
} as const;
export type ProductSearchSort = (typeof ProductSearchSort)[keyof typeof ProductSearchSort];
