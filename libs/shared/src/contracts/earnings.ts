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
