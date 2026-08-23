import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductReviewListDto, ProductReviewSummaryDto, ReviewDto, ReviewSort } from '@hb/shared';
import { Review } from './entities/review.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { ProductReviewQueryDto } from './dto/product-review-query.dto';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_PAGE = 1;

/** Primary sort column + direction per ReviewSort value. `review.id` tiebreaker is always appended. */
const SORT_MAP: Record<ReviewSort, { column: string; direction: 'ASC' | 'DESC' }> = {
  newest: { column: 'review.createdAt', direction: 'DESC' },
  highest: { column: 'review.rating', direction: 'DESC' },
  lowest: { column: 'review.rating', direction: 'ASC' },
};

/**
 * Public, anonymous-readable product reviews (GET /products/:productId/reviews —
 * see PDP note, RenderMode.Server). No write path here — that's PR-2
 * (POST/PATCH/DELETE + the eligibility endpoint), which will extend this
 * service with a `findOwnedReview` ownership lookup mirroring
 * `wishlist.service.ts`'s `findOwnedItem`.
 *
 * `averageRating`/`reviewCount` are ALWAYS a live SQL aggregate over
 * `product_reviews` — there is no denormalised counter on `products` to drift
 * out of sync with the underlying rows.
 */
@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async findAllForProduct(
    productId: string,
    query?: ProductReviewQueryDto,
  ): Promise<ProductReviewListDto> {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) {
      // Unknown productId is a 404, not an empty page — an empty page reads
      // as "no reviews yet" for a real product.
      throw new NotFoundException('Product not found');
    }

    const limit = Math.min(Math.max(query?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const page = Math.max(query?.page ?? DEFAULT_PAGE, 1);
    const skip = (page - 1) * limit;

    const summary = await this.getSummary(productId);

    const { column, direction } = SORT_MAP[query?.sort ?? 'newest'];
    const reviews = await this.reviewRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.user', 'user')
      .where('review.productId = :productId', { productId })
      .orderBy(column, direction)
      .addOrderBy('review.id', direction)
      .skip(skip)
      .take(limit)
      .getMany();

    return {
      items: reviews.map((review) => this.toDto(review)),
      // Same table, same productId filter, no further predicates — the
      // aggregate's count IS the total row count for this list.
      total: summary.reviewCount,
      page,
      limit,
      summary,
    };
  }

  /** Live SQL aggregate — average rounded to one decimal, `null` (never `0`) on zero reviews. */
  private async getSummary(productId: string): Promise<ProductReviewSummaryDto> {
    const raw = await this.reviewRepository
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'average')
      .addSelect('COUNT(review.id)', 'count')
      .where('review.productId = :productId', { productId })
      .getRawOne<{ average: string | null; count: string }>();

    const reviewCount = Number(raw?.count ?? 0);
    const averageRating = reviewCount === 0 ? null : Math.round(Number(raw?.average) * 10) / 10;

    return { averageRating, reviewCount };
  }

  /**
   * `authorName`: firstName + last-initial (e.g. "Michael J."), falling back
   * to firstName alone, then to "H&B Customer". The reviewer's email is
   * never read here — this method only ever touches firstName/lastName.
   */
  private deriveAuthorName(user?: User): string {
    const firstName = user?.firstName?.trim();
    if (!firstName) {
      return 'H&B Customer';
    }
    const lastInitial = user?.lastName?.trim()?.charAt(0);
    return lastInitial ? `${firstName} ${lastInitial.toUpperCase()}.` : firstName;
  }

  private toDto(review: Review): ReviewDto {
    return {
      id: review.id,
      productId: review.productId,
      rating: review.rating,
      body: review.body,
      authorName: this.deriveAuthorName(review.user),
      isVerifiedPurchase: review.isVerifiedPurchase,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    };
  }
}
