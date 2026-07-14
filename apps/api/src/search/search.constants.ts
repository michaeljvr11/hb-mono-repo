/** Injection token for the shared Meilisearch client instance. */
export const MEILI_CLIENT = 'MEILI_CLIENT';

/** The single products index backing GET /search and /search/suggest. */
export const PRODUCTS_INDEX = 'products';

/** Cap for the lean product suggest endpoint (matches the omnibox per-group cap). */
export const SUGGEST_LIMIT = 5;
