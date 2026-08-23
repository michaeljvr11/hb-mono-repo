/** Sort order for GET /products/:productId/reviews. Defaults to 'newest' when omitted. */
export const ReviewSort = {
  NEWEST: 'newest',
  HIGHEST: 'highest',
  LOWEST: 'lowest',
} as const;
export type ReviewSort = (typeof ReviewSort)[keyof typeof ReviewSort];

/** Why a signed-in user currently cannot review a product (GET /products/:productId/reviews/eligibility, PR-2). */
export const ReviewIneligibilityReason = {
  NOT_PURCHASED: 'not_purchased',
  ALREADY_REVIEWED: 'already_reviewed',
  OWN_LISTING: 'own_listing',
} as const;
export type ReviewIneligibilityReason =
  (typeof ReviewIneligibilityReason)[keyof typeof ReviewIneligibilityReason];
