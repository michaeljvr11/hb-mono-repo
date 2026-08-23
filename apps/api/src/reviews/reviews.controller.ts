import { Controller, Get, Param, Query } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ProductReviewQueryDto } from './dto/product-review-query.dto';
import { Public } from '../common/decorators/public.decorator';

/**
 * Anonymous-readable (the PDP is RenderMode.Server and must render
 * unauthenticated). Write endpoints (POST/PATCH/DELETE + eligibility) are
 * PR-2 and live behind the global JwtAuthGuard, not here.
 */
@Controller('products/:productId/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get()
  getReviews(@Param('productId') productId: string, @Query() query: ProductReviewQueryDto) {
    return this.reviewsService.findAllForProduct(productId, query);
  }
}
