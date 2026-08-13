import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { AdminEarningsQuery, EARNINGS_WINDOWS } from '@hb/shared';
import type { EarningsWindow } from '@hb/shared';
import { IsNotFutureDate } from '../../common/validators/is-not-future-date.validator';

export class AdminEarningsQueryDto implements AdminEarningsQuery {
  @IsOptional()
  @IsIn(EARNINGS_WINDOWS)
  window?: EarningsWindow;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  @IsNotFutureDate()
  to?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;
}
