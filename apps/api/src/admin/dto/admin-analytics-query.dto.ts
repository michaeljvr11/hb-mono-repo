import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { AdminAnalyticsQuery } from '@hb/shared';
import type { AnalyticsGranularity } from '@hb/shared';

export class AdminAnalyticsQueryDto implements AdminAnalyticsQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity?: AnalyticsGranularity;
}
