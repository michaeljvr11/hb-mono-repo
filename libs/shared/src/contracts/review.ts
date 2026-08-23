import { ReviewIneligibilityReason, ReviewSort } from '../enums';
import { PagedResponse } from './common';

/**
 * A single product review, anonymous-readable (GET /products/:productId/reviews is
 * @Public). `authorName` is derived at read time from the reviewer's first/last name
 * — the reviewer's email is NEVER included in this DTO.
 */
export interface ReviewDto {
  id: string;
  productId: string;
  /** 1–5, integer. */
  rating: number;
  body: string;
  /** Derived, e.g. "Michael J." — never the reviewer's raw name or email. */
  authorName: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductReviewSummaryDto {
  /** Rounded to one decimal. `null` (never `0`) when reviewCount is 0. */
  averageRating: number | null;
  reviewCount: number;
}

export interface ProductReviewListDto extends PagedResponse<ReviewDto> {
  summary: ProductReviewSummaryDto;
}

/** Query params for GET /products/:productId/reviews — all optional. */
export interface ProductReviewQuery {
  /** 1-based page number. Defaults to 1. */
  page?: number;
  /** Page size. Defaults to 10 server-side; clamped to a server-side max, never rejected. */
  limit?: number;
  /** Defaults to 'newest' when omitted. */
  sort?: ReviewSort;
}

/** PR-2: POST /products/:productId/reviews body. */
export interface CreateReviewRequest {
  rating: number;
  body: string;
}

/**
 * PR-5: PATCH /reviews/:id body — flat, id-scoped route (NOT nested under
 * /products/:productId/reviews — ownership is resolved by (review.id, userId)
 * in the service layer, productId plays no role in the route). At least one
 * of `rating`/`body` must be present; an empty `{}` is rejected.
 */
export type UpdateReviewRequest = Partial<CreateReviewRequest>;

/** PR-2: GET /products/:productId/reviews/eligibility response (authenticated). */
export interface ReviewEligibilityDto {
  canReview: boolean;
  reason: ReviewIneligibilityReason | null;
  /** Present when the caller already has a review on this product. */
  existingReviewId?: string;
}
