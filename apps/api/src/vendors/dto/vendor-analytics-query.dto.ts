import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { VendorAnalyticsQuery } from '@hb/shared';
import type { AnalyticsGranularity } from '@hb/shared';

export class VendorAnalyticsQueryDto implements VendorAnalyticsQuery {
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
