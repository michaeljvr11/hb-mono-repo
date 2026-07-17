import { BadRequestException } from '@nestjs/common';
import { AnalyticsGranularity } from '@hb/shared';

const DEFAULT_RANGE_DAYS = 30;

/**
 * Resolves the inclusive [from, to] UTC range for an analytics query,
 * applying the platform-wide 30-day default. Shared by `AdminAnalyticsService`
 * and `VendorAnalyticsService` so the range rules can never drift between the
 * admin and vendor-scoped read-models.
 *
 * `to` defaults to today; `from` defaults to 29 days before `to` (30 days
 * inclusive total). Throws `BadRequestException` when `from` is after `to`.
 */
export function resolveAnalyticsRange(query: { from?: string; to?: string }): {
  from: Date;
  to: Date;
} {
  const toStr = query.to ?? todayIsoDate();
  const to = endOfDayUTC(toStr);

  const fromStr = query.from ?? addDaysIsoDate(toStr, -(DEFAULT_RANGE_DAYS - 1));
  const from = startOfDayUTC(fromStr);

  if (from.getTime() > to.getTime()) {
    throw new BadRequestException('`from` must be before or equal to `to`');
  }

  return { from, to };
}

/**
 * Bucket start, as an ISO yyyy-mm-dd string, per the requested granularity
 * (UTC): day → the calendar date, week → the Monday of that ISO week,
 * month → the 1st of that month.
 */
export function analyticsBucketKey(date: Date, granularity: AnalyticsGranularity): string {
  if (granularity === 'month') {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }

  if (granularity === 'week') {
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = monday.getUTCDay(); // 0 = Sunday .. 6 = Saturday
    const diffToMonday = day === 0 ? -6 : 1 - day;
    monday.setUTCDate(monday.getUTCDate() + diffToMonday);
    return monday.toISOString().slice(0, 10);
  }

  // day
  return date.toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(isoDate: string, days: number): string {
  const d = startOfDayUTC(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfDayUTC(isoDate: string): Date {
  const datePart = isoDate.slice(0, 10);
  return new Date(`${datePart}T00:00:00.000Z`);
}

function endOfDayUTC(isoDate: string): Date {
  const datePart = isoDate.slice(0, 10);
  return new Date(`${datePart}T23:59:59.999Z`);
}
