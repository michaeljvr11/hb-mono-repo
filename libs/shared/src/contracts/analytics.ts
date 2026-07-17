import { AnalyticsEventType, CurrencyCode } from '../enums';

/**
 * Bespoke first-party analytics event, sent from the client as the customer
 * moves through the funnel (product_viewed → add_to_cart → checkout_started
 * → shipping_submitted → payment_attempted/payment_failed → order_completed).
 *
 * No PII: `sessionId` is a client-minted anonymous UUID (persisted in
 * localStorage), never an email/name/address. `metadata` is free-form
 * structured context and must never carry PII either — callers populate it
 * with things like `{ searchQuery }` or `{ declineReason }`, not identity.
 *
 * `currency` is REQUIRED whenever `value` is present (a monetary amount
 * without a currency is meaningless and rejected by the ingestion DTO) and
 * omitted entirely for non-monetary events (e.g. product_viewed).
 */
export interface CreateAnalyticsEventRequest {
  type: AnalyticsEventType;
  /** Client-minted anonymous UUID, persisted in localStorage. Never a user id. */
  sessionId: string;
  productId?: string;
  vendorId?: string;
  orderId?: string;
  /** Monetary amount, numeric(12,2). Requires `currency` whenever present. */
  value?: number;
  /** Required whenever `value` is present. */
  currency?: CurrencyCode;
  /** Free-form structured context. No PII. */
  metadata?: Record<string, unknown>;
  /** ISO timestamp, client clock. */
  occurredAt: string;
}

/**
 * Stored/returned shape of an analytics event: the request fields plus a
 * server-generated `id` and the server-clock `receivedAt`. `userId` is
 * intentionally NOT part of this contract — a client-supplied user id is
 * spoofable, so attribution stays entity-only (null for now) until a later
 * authenticated-attribution slice adds it server-side.
 */
export interface AnalyticsEventDto extends CreateAnalyticsEventRequest {
  id: string;
  /** ISO timestamp, server clock — when HB received the event. */
  receivedAt: string;
}
