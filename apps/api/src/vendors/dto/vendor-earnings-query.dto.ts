import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { EARNINGS_WINDOWS, VendorEarningsQuery } from '@hb/shared';
import type { EarningsWindow } from '@hb/shared';
import { IsNotFutureDate } from '../../common/validators/is-not-future-date.validator';

/**
 * Mirrors `AdminEarningsQueryDto` but implements `VendorEarningsQuery` —
 * deliberately has no `vendorId` field/validator. The vendor scope for
 * GET /vendors/me/earnings is always resolved server-side from the
 * authenticated user, never client-supplied.
 */
export class VendorEarningsQueryDto implements VendorEarningsQuery {
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
}
