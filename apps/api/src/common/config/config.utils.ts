import { ConfigService } from '@nestjs/config';

export function getRequiredConfig(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (value === undefined || value === '') {
    throw new Error(`Missing required config: ${key}`);
  }
  return value;
}
