import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  CreateReviewRequest,
  OrderStatus,
  ProductReviewListDto,
  ProductReviewSummaryDto,
  ReviewDto,
  ReviewEligibilityDto,
  ReviewIneligibilityReason,
  ReviewSort,
} from '@hb/shared';
import { Review } from './entities/review.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { ProductReviewQueryDto } from './dto/product-review-query.dto';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_PAGE = 1;

/** Postgres unique-violation SQLSTATE (same pattern as wishlist.service.ts). */
const UNIQUE_VIOLATION = '23505';

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
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Vendor)
    private readonly vendorRepository: Repository<Vendor>,
  ) {}

  async findAllForProduct(
    productId: string,
    query?: ProductReviewQueryDto,
  ): Promise<ProductReviewListDto> {
    // Unknown productId is a 404, not an empty page — an empty page reads
    // as "no reviews yet" for a real product.
    await this.getProductOrThrow(productId);

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

  /**
   * GET /products/:productId/reviews/eligibility (authenticated). Checked in
   * the same order the write path (`create`) gates on, so the UI's
   * eligibility read and the actual POST never disagree: own-listing, then
   * already-reviewed, then delivered-purchase.
   */
  async checkEligibility(user: User, productId: string): Promise<ReviewEligibilityDto> {
    const product = await this.getProductOrThrow(productId);

    if (await this.isOwnListing(user, product)) {
      return { canReview: false, reason: ReviewIneligibilityReason.OWN_LISTING };
    }

    const existing = await this.reviewRepository.findOne({
      where: { productId, userId: user.id },
    });
    if (existing) {
      return {
        canReview: false,
        reason: ReviewIneligibilityReason.ALREADY_REVIEWED,
        existingReviewId: existing.id,
      };
    }

    const hasDeliveredOrder = await this.hasDeliveredOrderFor(user.id, productId);
    if (!hasDeliveredOrder) {
      return { canReview: false, reason: ReviewIneligibilityReason.NOT_PURCHASED };
    }

    return { canReview: true, reason: null };
  }

  /**
   * POST /products/:productId/reviews (authenticated). `isVerifiedPurchase`
   * is stamped `true` here as a point-in-time snapshot — there is no FK to
   * `order_items` and it is never recomputed on read.
   */
  async create(user: User, productId: string, dto: CreateReviewRequest): Promise<ReviewDto> {
    const product = await this.getProductOrThrow(productId);

    if (await this.isOwnListing(user, product)) {
      throw new ForbiddenException('You cannot review your own listing');
    }

    // Pre-check so a duplicate never silently upserts over the existing
    // review text; the UNIQUE constraint below is the concurrent-race backstop.
    const existing = await this.reviewRepository.findOne({
      where: { productId, userId: user.id },
    });
    if (existing) {
      throw new ConflictException('You have already reviewed this product');
    }

    const hasDeliveredOrder = await this.hasDeliveredOrderFor(user.id, productId);
    if (!hasDeliveredOrder) {
      throw new ForbiddenException('You can only review a product from a delivered order');
    }

    const review = this.reviewRepository.create({
      productId,
      userId: user.id,
      rating: dto.rating,
      body: dto.body,
      isVerifiedPurchase: true,
    });

    let saved: Review;
    try {
      saved = await this.reviewRepository.save(review);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('You have already reviewed this product');
      }
      throw error;
    }

    saved.user = user;
    return this.toDto(saved);
  }

  private async getProductOrThrow(productId: string): Promise<Product> {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  /**
   * Vendor identity is resolved the same way `VendorsController`'s owner-gated
   * `/vendors/me*` routes do (`VendorsService.findByUserId`): via the
   * `vendors.userId` FK from the caller's account, not a field on `User`.
   */
  private async isOwnListing(user: User, product: Product): Promise<boolean> {
    if (!product.vendorId) {
      return false; // platform listing — no vendor to self-review as
    }
    const vendor = await this.vendorRepository.findOne({ where: { userId: user.id } });
    return vendor?.id === product.vendorId;
  }

  /**
   * The single EXISTS-join the eligibility gate and the create-path gate both
   * rely on: `order_items.productId = :productId` AND `orders.userId = :userId`
   * AND `orders.status = 'delivered'`. No new column, no new order state,
   * `ORDER_STATUS_TRANSITIONS` untouched — this only ever reads order state.
   */
  private async hasDeliveredOrderFor(userId: string, productId: string): Promise<boolean> {
    return this.orderItemRepository
      .createQueryBuilder('orderItem')
      .innerJoin('orderItem.order', 'order')
      .where('orderItem.productId = :productId', { productId })
      .andWhere('order.userId = :userId', { userId })
      .andWhere('order.status = :status', { status: OrderStatus.DELIVERED })
      .getExists();
  }

  private isUniqueViolation(error: unknown): boolean {
    const pgCode =
      error instanceof QueryFailedError
        ? (error.driverError as { code?: string } | undefined)?.code
        : undefined;
    return pgCode === UNIQUE_VIOLATION;
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
