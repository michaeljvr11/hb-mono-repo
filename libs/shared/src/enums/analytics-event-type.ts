/**
 * Bespoke first-party analytics funnel events (Analytics 1 spec). This list
 * is intentionally final for the ingestion slice — a later slice adds
 * aggregation/reporting DTOs, not new event types, without a fresh review.
 */
export const AnalyticsEventType = {
  PRODUCT_VIEWED: 'product_viewed',
  ADD_TO_CART: 'add_to_cart',
  CHECKOUT_STARTED: 'checkout_started',
  SHIPPING_SUBMITTED: 'shipping_submitted',
  PAYMENT_ATTEMPTED: 'payment_attempted',
  PAYMENT_FAILED: 'payment_failed',
  ORDER_COMPLETED: 'order_completed',
} as const;
export type AnalyticsEventType = (typeof AnalyticsEventType)[keyof typeof AnalyticsEventType];
