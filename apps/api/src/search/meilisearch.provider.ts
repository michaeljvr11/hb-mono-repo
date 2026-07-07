import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Meilisearch } from 'meilisearch';
import { buildMeilisearchOptions } from '../config/meilisearch.config';
import { MEILI_CLIENT } from './search.constants';

/**
 * Meilisearch client provider, built from the config factory — no hardcoded
 * host or key anywhere. The factory throws at boot when MEILI_HOST or
 * MEILI_MASTER_KEY is missing (fail loud, never fall back).
 */
export const meilisearchClientProvider: Provider = {
  provide: MEILI_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Meilisearch => {
    const { host, apiKey } = buildMeilisearchOptions(config);
    return new Meilisearch({ host, apiKey });
  },
};
