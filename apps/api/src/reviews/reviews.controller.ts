import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ProductReviewQueryDto } from './dto/product-review-query.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { Public } from '../common/decorators/public.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

/**
 * GET / is anonymous-readable (the PDP is RenderMode.Server and must render
 * unauthenticated). The eligibility check and POST are PR-2 and sit behind
 * the global JwtAuthGuard — no `@Public()` on either, so an anonymous caller
 * gets the guard's 401 rather than a bespoke "not authenticated" reason.
 * No edit/delete in this slice.
 */
@Controller('products/:productId/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get()
  getReviews(@Param('productId') productId: string, @Query() query: ProductReviewQueryDto) {
    return this.reviewsService.findAllForProduct(productId, query);
  }

  @Get('eligibility')
  getEligibility(@Param('productId') productId: string, @GetUser() user: User) {
    return this.reviewsService.checkEligibility(user, productId);
  }

  @Post()
  create(
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
    @GetUser() user: User,
  ) {
    return this.reviewsService.create(user, productId, dto);
  }
}
