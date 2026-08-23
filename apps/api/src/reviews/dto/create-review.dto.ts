import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { CreateReviewRequest } from '@hb/shared';

/** Whitespace-only input is not input — trim before Length so a "          "
 * body can't pass the 10-char floor or eat into the 2000-char cap. Shared
 * with update-review.dto.ts. */
export const trimmed = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** POST /products/:productId/reviews body. No `title`, no rating-only submissions. */
export class CreateReviewDto implements CreateReviewRequest {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @trimmed()
  @IsString()
  @Length(10, 2000)
  body: string;
}
