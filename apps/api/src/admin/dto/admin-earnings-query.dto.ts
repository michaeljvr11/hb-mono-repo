import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { AdminEarningsQuery } from '@hb/shared';
import type { EarningsWindow } from '@hb/shared';

export class AdminEarningsQueryDto implements AdminEarningsQuery {
  @IsOptional()
  @IsIn(['1w', '2w', '1m'])
  window?: EarningsWindow;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;
}
