/**
 * Admin-editable search synonyms (Postgres-backed, resolved spec open
 * question 9 — NOT a static checked-in config file). One record maps a
 * canonical `term` to its `equivalents` (e.g. term: "moisturiser",
 * equivalents: ["moisturizer"]); `bidirectional` controls whether the
 * reverse direction (each equivalent also finds the term and its siblings)
 * is applied when building the Meilisearch synonyms map.
 */
export interface SynonymDto {
  id: string;
  term: string;
  equivalents: string[];
  bidirectional: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SynonymCreateRequest {
  term: string;
  equivalents: string[];
  bidirectional?: boolean;
  enabled?: boolean;
}

export type SynonymUpdateRequest = Partial<SynonymCreateRequest>;
