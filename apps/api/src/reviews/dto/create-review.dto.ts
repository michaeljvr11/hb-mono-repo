import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { CreateReviewRequest } from '@hb/shared';

/** POST /products/:productId/reviews body. No `title`, no rating-only submissions. */
export class CreateReviewDto implements CreateReviewRequest {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @Length(10, 2000)
  body: string;
}
