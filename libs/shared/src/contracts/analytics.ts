import { AnalyticsEventType, CurrencyCode } from '../enums';
import { CurrencyTotalDto } from './dashboard';

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

// ─── Analytics 4 — admin aggregation/reporting (Analytics 1 events remain
// untouched above; a later slice adds vendor-scoped DTOs alongside these) ───

/** Time-series bucket width for the admin analytics summary. */
export type AnalyticsGranularity = 'day' | 'week' | 'month';

/**
 * Query params for the admin analytics summary endpoint. Range is inclusive
 * on both ends. When `from`/`to` are omitted, the server defaults to the
 * last 30 days (inclusive of today). `granularity` defaults to 'day'.
 */
export interface AdminAnalyticsQuery {
  /** ISO date (yyyy-mm-dd), inclusive. Defaults to 30 days before `to`. */
  from?: string;
  /** ISO date (yyyy-mm-dd), inclusive. Defaults to today. */
  to?: string;
  /** Time-series bucket width. Defaults to 'day'. */
  granularity?: AnalyticsGranularity;
}

/**
 * One funnel stage's reach within the query range. `sessions` counts
 * DISTINCT `sessionId`s that emitted that event type at least once in
 * range — not raw event counts — so a session firing the same event twice
 * (e.g. two `payment_attempted`) still counts once. All 7 `AnalyticsEventType`
 * values are always present, zero-filled when a stage had no sessions.
 */
export interface FunnelStageCountDto {
  stage: AnalyticsEventType;
  sessions: number;
}

/**
 * One time-series bucket (day/week/month per the query's `granularity`).
 * Mirrors the AP-10 order revenue rules: cancelled orders are excluded from
 * both `orders` and `revenueByCurrency`, and revenue is line GMV
 * (unitPrice * quantity), never order.total.
 */
export interface TimeSeriesPointDto {
  /** Bucket start, ISO yyyy-mm-dd (week buckets start Monday, month buckets start the 1st). */
  date: string;
  /** Orders created in this bucket. Cancelled orders excluded. */
  orders: number;
  /** Line GMV created in this bucket, grouped by currency. Cancelled orders excluded. */
  revenueByCurrency: CurrencyTotalDto[];
}

/** Admin analytics read-model — funnel reach, conversion, and revenue over a date range. */
export interface AdminAnalyticsSummaryDto {
  /** All 7 AnalyticsEventType stages, zero-filled, in enum declaration order. */
  funnel: FunnelStageCountDto[];
  /**
   * Distinct ORDER_COMPLETED sessions / distinct PRODUCT_VIEWED sessions,
   * rounded to 4 decimals. 0 when there were zero PRODUCT_VIEWED sessions
   * (never NaN/Infinity).
   */
  conversionRate: number;
  /** Range-total line GMV, grouped by currency. Cancelled orders excluded. */
  revenueByCurrency: CurrencyTotalDto[];
  /** Ordered ascending by `date`. Buckets with no orders/revenue may be omitted. */
  timeSeries: TimeSeriesPointDto[];
}

// ─── Analytics 5 — vendor-scoped aggregation/reporting ───

/**
 * Query params for the vendor analytics endpoint. Same range/granularity
 * semantics as `AdminAnalyticsQuery` (inclusive range, 30-day default,
 * 'day' granularity default) — kept as its own interface rather than a type
 * alias so the admin and vendor query contracts can diverge independently
 * later without a breaking rename of either.
 */
export interface VendorAnalyticsQuery {
  /** ISO date (yyyy-mm-dd), inclusive. Defaults to 30 days before `to`. */
  from?: string;
  /** ISO date (yyyy-mm-dd), inclusive. Defaults to today. */
  to?: string;
  /** Time-series bucket width. Defaults to 'day'. */
  granularity?: AnalyticsGranularity;
}

/**
 * Vendor-scoped analytics read-model — funnel reach, orders, and revenue for
 * ONE vendor's own listings/lines over a date range. The server always
 * resolves the vendor from the authenticated user; a client-supplied
 * vendorId is never accepted.
 *
 * Funnel caveat: `analytics_events.vendorId` is only populated on
 * PRODUCT_VIEWED and ADD_TO_CART (the client attaches it from the product
 * page/cart line) — checkout/shipping/payment/order-completed events are
 * basket-level and carry no vendorId. All 7 `AnalyticsEventType` stages are
 * still present (zero-filled), but in practice only the first two are ever
 * non-zero for a vendor-scoped funnel.
 */
export interface VendorAnalyticsDto {
  /** All 7 AnalyticsEventType stages, zero-filled — see funnel caveat above. */
  funnel: FunnelStageCountDto[];
  /** Distinct orders in range containing >= 1 of this vendor's lines. Cancelled orders excluded. */
  orderCount: number;
  /**
   * Gross GMV of this vendor's OWN order lines only, grouped by currency.
   * Cancelled orders excluded. Net-of-commission is out of scope for this slice.
   */
  revenueByCurrency: CurrencyTotalDto[];
  /** Ordered ascending by `date`. `orders`/`revenueByCurrency` scoped to this vendor's lines only. */
  timeSeries: TimeSeriesPointDto[];
}
