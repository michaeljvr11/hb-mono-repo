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
