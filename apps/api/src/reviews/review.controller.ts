import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { UpdateReviewDto } from './dto/update-review.dto';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

/**
 * Flat, id-scoped mutation routes for the caller's own review — deliberately
 * a separate controller from `ReviewsController`'s `products/:productId/reviews`
 * nesting. Per the "Product Reviews & Ratings" spec's Scope item 3, PATCH/DELETE
 * are `/reviews/:id`, not nested: ownership is resolved by (review.id, userId),
 * `productId` plays no role in the route.
 *
 * Ownership 404s (never 403) on a non-owned review — mirrors
 * `OrdersService.findOneForUser` / `AddressesService`'s doc-commented pattern
 * so a non-owned row is indistinguishable from a missing one. No admin
 * override in v1, by design.
 */
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReviewDto, @GetUser() user: User) {
    return this.reviewsService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @GetUser() user: User) {
    return this.reviewsService.remove(user, id);
  }
}
