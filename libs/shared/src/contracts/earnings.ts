import { CurrencyTotalDto } from './dashboard';

/**
 * Vendor commission rate — append-only history. The applicable rate for any
 * moment in time is the row with the greatest `effectiveFrom <= t`. Rows are
 * never edited or deleted after creation: changing "today's" rate must never
 * silently restate past order lines' earnings (see "Vendor Earnings &
 * Commission" spec). VE-3 snapshots the resolved rate onto order_items at
 * order-creation time.
 */
export interface CommissionRateDto {
  id: string;
  /** Platform commission, 0-100, 2 decimal places (e.g. 15.00 = 15%). */
  ratePercent: number;
  /** ISO-8601 UTC timestamp from which this rate applies. */
  effectiveFrom: string;
  /** Optional free-text context for why the rate changed. */
  note?: string;
  /** ISO-8601 UTC timestamp of when this row was created. */
  createdAt: string;
  /** The admin user who created this row, if known. */
  createdByUserId?: string;
}

/** Request body for POST /admin/commission-rates. Append-only: no update/delete request shapes. */
export interface CreateCommissionRateRequest {
  ratePercent: number;
  /** ISO-8601 UTC timestamp; defaults to now() if omitted. */
  effectiveFrom?: string;
  note?: string;
}

/** A commission rate history row, flagged with whether it is the rate
 *  currently in force (i.e. the row that `getRateAt(new Date())` resolves to). */
export interface CommissionRateListItemDto extends CommissionRateDto {
  inForce: boolean;
}

/** Full commission rate history, newest `effectiveFrom` first. */
export interface CommissionRateListDto {
  items: CommissionRateListItemDto[];
}

// ─── VE-4/VE-5 — payout-eligibility earnings reporting ───

/**
 * Preset reporting window (vault: "Vendor Earnings & Commission", resolved
 * 2026-07-28). `1w`/`2w` are ROLLING trailing periods ending now (matching
 * `AdminAnalyticsQuery`'s rolling-window convention); `1m` is the CURRENT
 * CALENDAR MONTH (1st of the month through now), not a rolling 30 days —
 * deliberately mixed semantics, confirmed with the business.
 */
export type EarningsWindow = '1w' | '2w' | '1m';

/**
 * Query params for GET /admin/earnings (and the vendor-scoped own-earnings
 * equivalent). Explicit `from`/`to` (ISO dates, inclusive) always win over
 * `window` when both are supplied. When neither is supplied, the server
 * defaults to `window: '1m'` (current calendar month), NOT
 * `AdminAnalyticsQuery`'s 30-day-rolling default.
 */
export interface AdminEarningsQuery {
  /** Preset trailing/calendar window. Defaults to '1m'. Ignored when `from`/`to` are both supplied. */
  window?: EarningsWindow;
  /** ISO date (yyyy-mm-dd), inclusive. Must be supplied together with `to`. */
  from?: string;
  /** ISO date (yyyy-mm-dd), inclusive. Must be supplied together with `from`. */
  to?: string;
  /** Scopes the report to one vendor — headline platform-wide figures narrow too. */
  vendorId?: string;
}

/**
 * One vendor's row in the admin cross-vendor earnings report. Built from
 * that vendor's payout-ELIGIBLE lines only (VE-3's `accrued` +
 * `settlementPreview` buckets) — lines still inside their 48h damage-claim
 * window (`pendingClaimWindow`) contribute nothing here. `grossByCurrency`
 * is always `commissionByCurrency + netByCurrency` per currency, derived —
 * never independently computed. Only currencies with at least one
 * contributing line appear (omit-zero-currency convention); a vendor with
 * zero eligible activity in the window still appears in the report with
 * `orderCount: 0` and empty arrays.
 */
export interface VendorEarningsSummaryDto {
  vendorId: string;
  businessName: string;
  /** Distinct orders contributing an eligible line for this vendor in the window. */
  orderCount: number;
  grossByCurrency: CurrencyTotalDto[];
  commissionByCurrency: CurrencyTotalDto[];
  netByCurrency: CurrencyTotalDto[];
}

/**
 * Admin cross-vendor earnings report (accounting-accurate — see vault
 * "Vendor Earnings & Commission"). `platformRevenue`/`vendorRevenue` on
 * `AdminDashboardDto` are gross line GMV; the figures here are the real
 * accounting split: what H&B has actually earned in fees
 * (`platformCommissionByCurrency`), what's owed to vendors but not yet
 * settled (`heldForVendorsByCurrency`), and first-party platform-listing GMV
 * (`platformListingGmvByCurrency`, explicitly GMV not revenue — no
 * delivered/refund gating for platform lines in this slice).
 */
export interface AdminEarningsReportDto {
  /** ISO-8601 UTC timestamp — resolved start of the report window. */
  from: string;
  /** ISO-8601 UTC timestamp — resolved end of the report window. */
  to: string;
  /** Every currently-APPROVED vendor, zero-filled — or just the one vendor named by `vendorId`, when that filter is supplied. */
  vendors: VendorEarningsSummaryDto[];
  /** Commission earned on eligible lines (accrued + settlementPreview), platform-wide. */
  platformCommissionByCurrency: CurrencyTotalDto[];
  /** Gross GMV of PLATFORM-listing-type order lines in the window. GMV, not revenue. */
  platformListingGmvByCurrency: CurrencyTotalDto[];
  /** VE-3's `accrued` bucket, platform-wide — money owed to vendors, not yet H&B revenue. */
  heldForVendorsByCurrency: CurrencyTotalDto[];
}
