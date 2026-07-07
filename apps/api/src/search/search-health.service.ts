import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Meilisearch } from 'meilisearch';
import { MEILI_CLIENT } from './search.constants';

/**
 * Boot-time reachability check for Meilisearch.
 *
 * - In dev: fail LOUD — an unreachable engine means the whole search vertical
 *   is silently broken, so refuse to boot rather than degrade quietly.
 * - In production: log an error but keep serving — the rest of the API must
 *   not be taken down by a search-engine outage; the daily reindex + health
 *   monitoring surface the problem.
 */
@Injectable()
export class SearchHealthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SearchHealthService.name);

  constructor(
    @Inject(MEILI_CLIENT) private readonly client: Meilisearch,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.client.health();
      this.logger.log('Meilisearch reachable — search engine ready');
    } catch (error) {
      const message =
        `Meilisearch is unreachable at boot (${(error as Error).message}). ` +
        'Check MEILI_HOST / MEILI_MASTER_KEY and that the meilisearch compose service is up.';
      if (this.config.get<string>('NODE_ENV') === 'production') {
        this.logger.error(message);
        return;
      }
      throw new Error(message);
    }
  }
}
