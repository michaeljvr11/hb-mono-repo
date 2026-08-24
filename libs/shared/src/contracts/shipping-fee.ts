import { CountryCode, CurrencyCode } from '../enums';

/**
 * Admin-configurable global shipping fee — append-only, effective-dated history,
 * mirroring `CommissionRateDto` (VE-1). Unlike commission (a currency-free
 * percentage), the fee is money and is keyed on a **route** as well as a
 * currency: a route is an origin→destination country pair. `CountryCode` has
 * exactly two members (ZA, NA), so there are exactly 4 routes — ZA→ZA, ZA→NA,
 * NA→NA, NA→ZA — all configurable. NA→ZA is included deliberately:
 * `orders.originCountry` is derived from `product.originCountry` and can
 * legitimately be NA, so a NA→ZA order is representable and must never
 * resolve to a guessed fee. A fee configured for one route/currency is never
 * applied to a different route or the other currency — the ZAR/NAD peg is
 * data, never an assumption.
 */
export interface ShippingFeeDto {
  id: string;
  /** The flat fee, in `currency`. */
  amount: number;
  currency: CurrencyCode;
  originCountry: CountryCode;
  destinationCountry: CountryCode;
  /** ISO-8601 UTC timestamp from which this fee applies. */
  effectiveFrom: string;
  /** Optional free-text context for why the fee changed. */
  note?: string;
  /** ISO-8601 UTC timestamp of when this row was created. */
  createdAt: string;
  /** The admin user who created this row, if known. */
  createdByUserId?: string;
}

/**
 * One admin change = one "set": all 4 routes x 2 currencies (8 rows) sharing
 * a single `effectiveFrom`, inserted together in one transaction. The history
 * list groups by `effectiveFrom` so the admin sees one row per change, not
 * one per (route, currency) combination.
 */
export interface ShippingFeeSetDto {
  effectiveFrom: string;
  /** Exactly one entry per (route, currency) combination — 8 total. */
  fees: ShippingFeeDto[];
  /** Whether this is the set currently in force (i.e. what `getFeeAt(new Date(), ...)` resolves to). */
  inForce: boolean;
}

/** Full shipping-fee history, newest `effectiveFrom` first. */
export interface ShippingFeeHistoryDto {
  items: ShippingFeeSetDto[];
}

/** One (route, currency) entry of a shipping-fee set submission. */
export interface CreateShippingFeeSetEntry {
  originCountry: CountryCode;
  destinationCountry: CountryCode;
  currency: CurrencyCode;
  amount: number;
}

/**
 * Request body for POST /admin/shipping-fees. Must cover every (route,
 * currency) combination — 4 routes x 2 currencies = 8 entries — in one
 * request; a partial set is rejected so no route/currency pair is ever left
 * unpriced. Append-only: no update/delete request shapes.
 */
export interface CreateShippingFeeSetRequest {
  fees: CreateShippingFeeSetEntry[];
  /** ISO-8601 UTC timestamp; defaults to now() if omitted. */
  effectiveFrom?: string;
  note?: string;
}

/**
 * Read model for the checkout preview — the fee that would apply right now
 * for a specific route + currency, so the UI can display it before the order
 * exists. (Endpoint owned by SF-3, not this card.)
 */
export interface CurrentShippingFeeDto {
  amount: number;
  currency: CurrencyCode;
  originCountry: CountryCode;
  destinationCountry: CountryCode;
}

/**
 * Query for GET /shipping-fee/current. The checkout UI (SF-4) states the
 * destination + currency explicitly. `originCountry` is optional: the cart
 * (not the client) is the source of truth for which route an order will
 * actually be placed on, so when it is omitted the server derives it from
 * the caller's own cart using exactly the rule `OrdersService.create` uses
 * (see `resolveCartOriginCountry`) — this guarantees the previewed fee can
 * never drift from the fee actually charged. Supplying `originCountry`
 * explicitly is still honoured (e.g. admin tooling probing a specific
 * route with no cart in play) — the server never overrides a caller-stated
 * origin.
 */
export interface GetCurrentShippingFeeQuery {
  originCountry?: CountryCode;
  destinationCountry: CountryCode;
  currency: CurrencyCode;
}

/**
 * Identifies one (route, currency) combination for a per-product shipping fee
 * override. A route is an origin→destination `CountryCode` pair, same as the
 * global default (SF-1) — 4 routes x 2 currencies = 8 possible combinations
 * per product, but unlike the global default **an override does not need to
 * cover all 8**: an admin may set only the combinations where pre-positioned
 * stock makes shipping cheaper (e.g. NA→NA), leaving every other combination
 * to fall back to the global default (`ShippingFeeService.getFeeAt`).
 */
export interface ProductShippingFeeOverrideRoute {
  originCountry: CountryCode;
  destinationCountry: CountryCode;
  currency: CurrencyCode;
}

/**
 * Per-product shipping fee override (SF-5). Unlike `ShippingFeeDto`, this is
 * **mutable, not effective-dated** — there is no history, the current row IS
 * the value (mirrors `products.price`). This is deliberate: the amount
 * actually charged is frozen onto `orders.shippingTotal` at order-creation
 * time (SF-3), so historical order integrity never depends on this table
 * being append-only.
 */
export interface ProductShippingFeeOverrideDto extends ProductShippingFeeOverrideRoute {
  id: string;
  productId: string;
  /** The flat fee, in `currency`, overriding the global default for this exact (product, route, currency). */
  amount: number;
  /** ISO-8601 UTC timestamp of when this override was last set. */
  updatedAt: string;
  /** The admin user who last set this override, if known. */
  updatedByUserId?: string;
}

/**
 * Request body for PUT /admin/products/:productId/shipping-fee-overrides.
 * Upsert semantics: a second call for the same (product, route, currency)
 * replaces the amount in place — no history is kept.
 */
export interface SetProductShippingFeeOverrideRequest extends ProductShippingFeeOverrideRoute {
  amount: number;
}
