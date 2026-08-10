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
 *
 * `EARNINGS_WINDOWS` is the single source of truth for the valid values —
 * runtime validators (`class-validator`'s `@IsIn`) must derive from this
 * array rather than restating the literal union, so adding/removing a preset
 * here can't silently drift from what the API actually accepts.
 */
export const EARNINGS_WINDOWS = ['1w', '2w', '1m'] as const;
export type EarningsWindow = (typeof EARNINGS_WINDOWS)[number];

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
  /**
   * VE-3's `accrued` bucket, platform-wide — money owed to vendors, not yet
   * H&B revenue. Note: this is a "currently held" snapshot (relative to the
   * real clock at request time), NOT a figure scoped to `[from, to]` the way
   * every other field on this DTO is — querying a past window still reports
   * what's held for vendors *right now*, not what was held during that past
   * window.
   */
  heldForVendorsByCurrency: CurrencyTotalDto[];
}

// ─── VE-5 — vendor own-earnings reporting ───

/**
 * Query params for GET /vendors/me/earnings — the vendor-scoped mirror of
 * `AdminEarningsQuery`. Deliberately has NO `vendorId` field: the vendor
 * scope is ALWAYS resolved from the authenticated user server-side, never
 * client-supplied — this is the ownership boundary for the endpoint.
 */
export interface VendorEarningsQuery {
  /** Preset trailing/calendar window. Defaults to '1m'. Ignored when `from`/`to` are both supplied. */
  window?: EarningsWindow;
  /** ISO date (yyyy-mm-dd), inclusive. Must be supplied together with `to`. */
  from?: string;
  /** ISO date (yyyy-mm-dd), inclusive. Must be supplied together with `from`. */
  to?: string;
}

/**
 * Net-of-commission balance split (vault "Vendor Earnings & Commission"):
 * money delivered but still awaiting the 48-hour damage-claim window vs
 * money that has cleared the window and is accrued/eligible. Both figures
 * are NET amounts (the vendor's own cut) — commission is H&B's cut and is
 * not broken out here; see `summary` for the commission side.
 */
export interface EarningsBalanceDto {
  /** Delivered, but still inside the 48h damage-claim window — not yet eligible. */
  pendingClaimWindowByCurrency: CurrencyTotalDto[];
  /** Eligible (claim window elapsed); includes the currently-accruing settlement period. */
  accruedByCurrency: CurrencyTotalDto[];
}

/**
 * One bi-weekly settlement period, bucketed off VE-3's `SETTLEMENT_ANCHOR_DATE`.
 * `'closed'` entries are periods entirely in the past (VE-3's `settlementPreview`
 * bucket, unmodified). There is always exactly ONE `'open'` entry — the
 * currently-accruing period, sourced from the `accrued` bucket — appended
 * after the closed entries, even when its `orderCount` is 0 (a vendor with no
 * activity still sees "this period: R0.00", not a missing row).
 */
export interface SettlementPeriodPreviewDto {
  /** ISO-8601 UTC timestamp — inclusive period start. */
  periodStart: string;
  /** ISO-8601 UTC timestamp — exclusive period end. */
  periodEnd: string;
  orderCount: number;
  netByCurrency: CurrencyTotalDto[];
  status: 'open' | 'closed';
}

/**
 * Vendor's own earnings report (GET /vendors/me/earnings) — the vendor-scoped
 * mirror of `AdminEarningsReportDto`. `summary` reuses `VendorEarningsSummaryDto`
 * verbatim: same eligible-lines-only semantics VE-4 established (`accrued` +
 * closed `settlementPreview`, excluding `pendingClaimWindow`) — this aligns
 * the vault's "commission on eligible lines" framing and keeps this report's
 * totals reconcilable with the admin cross-vendor report's per-vendor row.
 */
export interface VendorEarningsReportDto {
  /** ISO-8601 UTC timestamp — resolved start of the report window. */
  from: string;
  /** ISO-8601 UTC timestamp — resolved end of the report window. */
  to: string;
  summary: VendorEarningsSummaryDto;
  balance: EarningsBalanceDto;
  settlementPreview: SettlementPeriodPreviewDto[];
}
