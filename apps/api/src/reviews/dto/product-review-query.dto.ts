import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductReviewQuery, ReviewSort } from '@hb/shared';

export class ProductReviewQueryDto implements ProductReviewQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  // No @Max here — an out-of-range limit is clamped server-side
  // (ReviewsService), never rejected.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsEnum(ReviewSort)
  sort?: ReviewSort;
}
