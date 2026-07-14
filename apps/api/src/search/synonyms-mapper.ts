import { Synonym } from './entities/synonym.entity';

/**
 * Minimal shape the mapper needs — lets both the real TypeORM entity and
 * plain test fixtures satisfy it without an extra adapter layer.
 */
export type SynonymMapperInput = Pick<
  Synonym,
  'term' | 'equivalents' | 'bidirectional' | 'enabled'
>;

/**
 * Builds the Meilisearch `synonyms` settings map from the Postgres-backed
 * synonym groups. Reused verbatim by card #52's admin-save reload path and
 * by the daily full reindex (SearchSettingsService.applySettings) — one
 * mapper, no drift.
 *
 * Meilisearch synonyms are directional per key (`{ key: [equivalents] }`
 * means searching `key` also matches `equivalents`, but not the reverse).
 * `bidirectional: true` therefore adds the reverse edges explicitly: every
 * equivalent maps back to the term plus its sibling equivalents.
 * `bidirectional: false` only adds the forward `term -> equivalents` edge.
 *
 * Disabled groups are skipped. Multiple groups touching the same key merge
 * (deduplicated) rather than overwrite.
 */
export function buildMeilisearchSynonymsMap(
  synonyms: SynonymMapperInput[],
): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};

  const addEdge = (key: string, values: string[]): void => {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey || !values.length) return;
    const set = map[normalizedKey] ?? (map[normalizedKey] = new Set());
    for (const value of values) {
      const normalizedValue = value.trim().toLowerCase();
      if (normalizedValue && normalizedValue !== normalizedKey) set.add(normalizedValue);
    }
  };

  for (const synonym of synonyms) {
    if (!synonym.enabled) continue;

    const equivalents = synonym.equivalents.filter(Boolean);
    if (!equivalents.length) continue;

    addEdge(synonym.term, equivalents);

    if (synonym.bidirectional) {
      for (const equivalent of equivalents) {
        const siblings = equivalents.filter((e) => e !== equivalent);
        addEdge(equivalent, [synonym.term, ...siblings]);
      }
    }
  }

  const result: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(map)) {
    result[key] = [...values];
  }
  return result;
}
