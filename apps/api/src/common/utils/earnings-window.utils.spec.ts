import { resolveEarningsWindow } from './earnings-window.utils';

describe('resolveEarningsWindow', () => {
  it('defaults to the current calendar month when neither window nor from/to are supplied', () => {
    const now = new Date('2026-08-10T15:30:00.000Z');
    const { from, to } = resolveEarningsWindow({}, now);

    expect(from).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(to).toEqual(now);
  });

  it("window: '1m' resolves the current calendar month through now, queried on the 1st of the month", () => {
    const now = new Date('2026-08-01T00:00:01.000Z');
    const { from, to } = resolveEarningsWindow({ window: '1m' }, now);

    expect(from).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(to).toEqual(now);
  });

  it("window: '1m' resolves the current calendar month through now, queried on the last day of the month", () => {
    const now = new Date('2026-08-31T23:59:59.000Z');
    const { from, to } = resolveEarningsWindow({ window: '1m' }, now);

    expect(from).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(to).toEqual(now);
  });

  it("window: '1m' handles a month/year rollover (queried early January) — 'now' month, not December", () => {
    const now = new Date('2027-01-03T09:00:00.000Z');
    const { from, to } = resolveEarningsWindow({ window: '1m' }, now);

    expect(from).toEqual(new Date('2027-01-01T00:00:00.000Z'));
    expect(to).toEqual(now);
  });

  it("window: '1m' handles February in a leap year (2028) through 'now' on the 29th", () => {
    const now = new Date('2028-02-29T12:00:00.000Z');
    const { from, to } = resolveEarningsWindow({ window: '1m' }, now);

    expect(from).toEqual(new Date('2028-02-01T00:00:00.000Z'));
    expect(to).toEqual(now);
  });

  it("window: '1m' handles February in a non-leap year (2026) through 'now' on the 28th", () => {
    const now = new Date('2026-02-28T12:00:00.000Z');
    const { from, to } = resolveEarningsWindow({ window: '1m' }, now);

    expect(from).toEqual(new Date('2026-02-01T00:00:00.000Z'));
    expect(to).toEqual(now);
  });

  it("window: '1w' is a rolling 7-day trailing period ending at the actual instant 'now' (not end-of-day)", () => {
    const now = new Date('2026-08-10T15:30:00.000Z');
    const { from, to } = resolveEarningsWindow({ window: '1w' }, now);

    expect(from).toEqual(new Date('2026-08-03T15:30:00.000Z'));
    expect(to).toEqual(now);
  });

  it("window: '2w' is a rolling 14-day trailing period ending at the actual instant 'now'", () => {
    const now = new Date('2026-08-10T15:30:00.000Z');
    const { from, to } = resolveEarningsWindow({ window: '2w' }, now);

    expect(from).toEqual(new Date('2026-07-27T15:30:00.000Z'));
    expect(to).toEqual(now);
  });

  it('explicit from/to beats window when both are supplied', () => {
    const now = new Date('2026-08-10T15:30:00.000Z');
    const { from, to } = resolveEarningsWindow(
      { window: '1w', from: '2026-01-01', to: '2026-01-31' },
      now,
    );

    expect(from).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(to).toEqual(new Date('2026-01-31T23:59:59.999Z'));
  });

  it('explicit from/to targeting a past month returns the full month, ignoring an unrelated window preset', () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    const { from, to } = resolveEarningsWindow(
      { window: '1m', from: '2026-02-01', to: '2026-02-28' },
      now,
    );

    // February 2026 is not a leap year — 28 days, full month captured exactly.
    expect(from).toEqual(new Date('2026-02-01T00:00:00.000Z'));
    expect(to).toEqual(new Date('2026-02-28T23:59:59.999Z'));
  });

  it('explicit from/to targeting a past leap-February returns the full 29-day month', () => {
    const now = new Date('2028-08-10T00:00:00.000Z');
    const { from, to } = resolveEarningsWindow({ from: '2028-02-01', to: '2028-02-29' }, now);

    expect(from).toEqual(new Date('2028-02-01T00:00:00.000Z'));
    expect(to).toEqual(new Date('2028-02-29T23:59:59.999Z'));
  });

  it('throws when only `from` is supplied without `to`', () => {
    expect(() => resolveEarningsWindow({ from: '2026-01-01' })).toThrow();
  });

  it('throws when only `to` is supplied without `from`', () => {
    expect(() => resolveEarningsWindow({ to: '2026-01-01' })).toThrow();
  });

  it('throws when `from` is after `to`', () => {
    expect(() => resolveEarningsWindow({ from: '2026-02-01', to: '2026-01-01' })).toThrow();
  });
});
