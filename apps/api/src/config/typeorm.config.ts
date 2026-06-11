import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';

/**
 * Single source of truth for Postgres connection options, used by both the
 * running app (app.module.ts) and the TypeORM CLI (database/data-source.ts).
 * Schema changes go through migrations — synchronize stays off everywhere.
 */
export function buildTypeOrmOptions(config: ConfigService): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', 'localhost'),
    port: Number(config.get('DB_PORT', 5432)),
    username: config.get<string>('DB_USERNAME', 'hbuser'),
    password: config.get<string>('DB_PASSWORD', 'devpassword123'),
    database: config.get<string>('DB_DATABASE', 'hb_ecommerce'),
    synchronize: false,
    logging: ['error'],
  };
}
