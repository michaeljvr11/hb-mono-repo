import { ConfigService } from '@nestjs/config';

/**
 * Single source of truth for Meilisearch connection options, mirroring the
 * typeorm.config.ts factory pattern. Host and master key come from env ONLY —
 * there is deliberately no default/hardcoded value for either: a missing value
 * must fail loud at boot rather than silently pointing at a wrong (or
 * unauthenticated) instance. See apps/api/.env.example.
 */
export interface MeilisearchOptions {
  host: string;
  apiKey: string;
}

export function buildMeilisearchOptions(config: ConfigService): MeilisearchOptions {
  const host = config.get<string>('MEILI_HOST');
  const apiKey = config.get<string>('MEILI_MASTER_KEY');

  if (!host) {
    throw new Error(
      'MEILI_HOST is not set. The search engine requires an explicit Meilisearch host ' +
        '(e.g. http://localhost:7700) — see apps/api/.env.example.',
    );
  }
  if (!apiKey) {
    throw new Error(
      'MEILI_MASTER_KEY is not set. The search engine requires an explicit Meilisearch ' +
        'master key — no default is provided on purpose. See apps/api/.env.example.',
    );
  }

  return { host, apiKey };
}
