import { BadRequestException } from '@nestjs/common';
import { EarningsWindow } from '@hb/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Epoch sentinel used as the `from` bound for `window: 'all'` (vault:
 * "Earnings Date-Range Filtering", resolved 2026-08-11) — a fixed constant,
 * NOT a lookup of the earliest `order.createdAt`. Exported so callers/tests
 * can assert against it by name instead of a magic literal. The UI renders
 * the label "All time" for this window — it must never render this raw date.
 *
 * Treat this as immutable: `resolveEarningsWindow` always returns a fresh
 * `Date` built from this value, never this instance itself, so a caller
 * mutating the returned `from` can't corrupt future calls.
 */
export const ALL_TIME_START = new Date(0);

/**
 * Resolves the [from, to] UTC range for an admin/vendor earnings query
 * (vault: "Vendor Earnings & Commission", resolved 2026-07-28). Deliberately
 * a SIBLING to `resolveAnalyticsRange`, not a reuse of it — the semantics
 * differ on purpose:
 *
 * - Explicit `from`/`to` (ISO dates, inclusive) always win over `window`
 *   when supplied — including when they target a past month while `window`
 *   also happens to be `'1m'`; that's not a special case, just this rule.
 *   Both must be supplied together (an admin picking a custom range picks
 *   both ends) — supplying only one throws. This precedence also applies
 *   over `window: 'all'` — explicit dates always win.
 * - With neither supplied, default to `window: '1m'` — the CURRENT CALENDAR
 *   MONTH — NOT `resolveAnalyticsRange`'s 30-day-rolling default.
 * - `'1w'`/`'2w'` are ROLLING trailing periods ending at the actual current
 *   instant (`now`), not end-of-today.
 * - `'1m'` is the 1st of the current calendar month, 00:00 UTC, through
 *   `now` (the real instant, not end-of-day) — never a rolling 30 days.
 *   Month/year rollover and leap-February fall out naturally from
 *   `Date.UTC`'s own month arithmetic; no bespoke calendar math needed here.
 * - `'all'` is full history: `from` is the `ALL_TIME_START` epoch sentinel,
 *   `to` is `now` — the same real instant every other preset ends at. The
 *   sentinel is a server-side implementation detail; the UI must render the
 *   label "All time", never the raw resolved date.
 */
export function resolveEarningsWindow(
  query: { window?: EarningsWindow; from?: string; to?: string },
  now: Date = new Date(),
): { from: Date; to: Date } {
  if (query.from !== undefined || query.to !== undefined) {
    if (query.from === undefined || query.to === undefined) {
      throw new BadRequestException('`from` and `to` must be supplied together');
    }

    const from = startOfDayUTC(query.from);
    const to = endOfDayUTC(query.to);

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('`from` must be before or equal to `to`');
    }

    return { from, to };
  }

  const window = query.window ?? '1m';

  if (window === '1w') {
    return { from: new Date(now.getTime() - 7 * DAY_MS), to: now };
  }

  if (window === '2w') {
    return { from: new Date(now.getTime() - 14 * DAY_MS), to: now };
  }

  if (window === 'all') {
    return { from: new Date(ALL_TIME_START.getTime()), to: now };
  }

  // '1m': current calendar month, 1st 00:00 UTC through now.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  return { from, to: now };
}

function startOfDayUTC(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
}

function endOfDayUTC(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T23:59:59.999Z`);
}
