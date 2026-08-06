/**
 * Hours after `orders.deliveredAt` before an order line becomes
 * payout-eligible (vault: "Vendor Earnings & Commission" —
 * `H&B Brain/13-payments-payouts.md`'s damage-claim window). A single named
 * constant so this never becomes a magic number scattered across services.
 */
export const DAMAGE_CLAIM_WINDOW_HOURS = 48;

/**
 * Placeholder anchor date for bi-weekly settlement-period bucketing (vault
 * "Vendor Earnings & Commission" data model point 4) — a Monday, chosen only
 * to give bi-weekly periods a fixed reference point. This is NOT a real ops
 * decision: `13-payments-payouts.md` never states which calendar date the
 * two-week settlement periods count from. Every bi-weekly bucketing
 * calculation MUST read this single constant — never inline or duplicate the
 * value elsewhere. Trivially swappable once a human settles the real anchor
 * for the (still unbuilt) settlement-execution job.
 */
export const SETTLEMENT_ANCHOR_DATE = new Date('2026-01-05T00:00:00.000Z');
