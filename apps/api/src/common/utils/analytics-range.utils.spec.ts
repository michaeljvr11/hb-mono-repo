import { BadRequestException } from '@nestjs/common';
import { analyticsBucketKey, resolveAnalyticsRange } from './analytics-range.utils';

describe('analytics-range.utils', () => {
  // ─── resolveAnalyticsRange ────────────────────────────────────────────────

  describe('resolveAnalyticsRange', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('defaults to a 30-day inclusive window ending today when from/to are both omitted', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-17T15:00:00.000Z'));

      const { from, to } = resolveAnalyticsRange({});

      expect(to.toISOString()).toBe('2026-07-17T23:59:59.999Z');
      // 29 calendar days before "to"'s date -> 30 inclusive calendar days total
      // (2026-06-18 .. 2026-07-17 inclusive === 30 dates).
      expect(from.toISOString()).toBe('2026-06-18T00:00:00.000Z');
    });

    it('defaults `to` to today when only `from` is supplied', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-17T04:00:00.000Z'));

      const { to } = resolveAnalyticsRange({ from: '2026-07-01' });

      expect(to.toISOString()).toBe('2026-07-17T23:59:59.999Z');
    });

    it('accepts an explicit from/to range verbatim (start of day / end of day UTC)', () => {
      const { from, to } = resolveAnalyticsRange({ from: '2026-01-01', to: '2026-01-31' });

      expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(to.toISOString()).toBe('2026-01-31T23:59:59.999Z');
    });

    it('accepts a single-day range where from === to without throwing', () => {
      const { from, to } = resolveAnalyticsRange({ from: '2026-03-10', to: '2026-03-10' });

      expect(from.toISOString()).toBe('2026-03-10T00:00:00.000Z');
      expect(to.toISOString()).toBe('2026-03-10T23:59:59.999Z');
      expect(from.getTime()).toBeLessThan(to.getTime());
    });

    it('throws BadRequestException when from is one day after to', () => {
      expect(() => resolveAnalyticsRange({ from: '2026-01-02', to: '2026-01-01' })).toThrow(
        BadRequestException,
      );
    });
  });

  // ─── analyticsBucketKey ────────────────────────────────────────────────────

  describe('analyticsBucketKey — day', () => {
    it('returns the UTC calendar date unchanged', () => {
      expect(analyticsBucketKey(new Date('2026-07-17T23:59:00.000Z'), 'day')).toBe('2026-07-17');
    });
  });

  describe('analyticsBucketKey — week', () => {
    it("maps a mid-week (Wednesday) date to that week's Monday", () => {
      // 2026-07-15 is a Wednesday.
      expect(analyticsBucketKey(new Date('2026-07-15T10:00:00.000Z'), 'week')).toBe('2026-07-13');
    });

    it('maps a date that is already Monday to itself', () => {
      expect(analyticsBucketKey(new Date('2026-07-13T00:00:00.000Z'), 'week')).toBe('2026-07-13');
    });

    it('maps a Sunday back to the PRECEDING Monday, not forward (getUTCDay() === 0 edge case)', () => {
      // 2026-07-19 is a Sunday; the ISO week it belongs to started Monday 2026-07-13.
      expect(analyticsBucketKey(new Date('2026-07-19T12:00:00.000Z'), 'week')).toBe('2026-07-13');
    });

    it("handles a week boundary that crosses a month (Saturday -> prior month's Monday)", () => {
      // 2026-08-01 is a Saturday; that week started Monday 2026-07-27.
      expect(analyticsBucketKey(new Date('2026-08-01T00:00:00.000Z'), 'week')).toBe('2026-07-27');
    });
  });

  describe('analyticsBucketKey — month', () => {
    it('maps any day in the month to the 1st of that month', () => {
      expect(analyticsBucketKey(new Date('2026-02-28T23:00:00.000Z'), 'month')).toBe('2026-02-01');
      expect(analyticsBucketKey(new Date('2026-02-01T00:00:00.000Z'), 'month')).toBe('2026-02-01');
    });

    it('does not leak into the next month for a date at the very end of the month (UTC)', () => {
      expect(analyticsBucketKey(new Date('2026-12-31T23:59:59.999Z'), 'month')).toBe('2026-12-01');
    });
  });
});
