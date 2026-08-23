import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { UpdateReviewRequest } from '@hb/shared';
import { trimmed } from './create-review.dto';

/**
 * PATCH /reviews/:id body. Both fields are individually optional (class
 * shape mirrors `Partial<CreateReviewRequest>`), but `ReviewsService.update`
 * rejects a payload where neither is present — class-validator's
 * `@IsOptional()` only skips validation of an absent field, it does not
 * enforce "at least one of" across two fields.
 *
 * Deliberately has no `productId`/`userId`/`isVerifiedPurchase` fields —
 * those columns are immutable and the service never touches them.
 */
export class UpdateReviewDto implements UpdateReviewRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @trimmed()
  @IsString()
  @Length(10, 2000)
  body?: string;
}
