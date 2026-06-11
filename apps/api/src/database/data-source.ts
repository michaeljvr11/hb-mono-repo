import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from '../config/typeorm.config';

/**
 * TypeORM CLI entry point (migration:generate / run / revert).
 * Run from apps/api so the .env file there is picked up.
 */
const config = new ConfigService();

export default new DataSource({
  ...buildTypeOrmOptions(config),
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
});
