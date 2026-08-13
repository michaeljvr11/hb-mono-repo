import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminEarningsQueryDto } from './admin-earnings-query.dto';

async function validateDto(raw: Record<string, unknown>) {
  const dto = plainToInstance(AdminEarningsQueryDto, raw);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

describe('AdminEarningsQueryDto validation', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts an empty query (every field optional)', async () => {
    const { errors } = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('accepts window: "all" with no `@IsIn` edit required — EARNINGS_WINDOWS is the single source of truth', async () => {
    const { errors } = await validateDto({ window: 'all' });
    expect(errors.map((e) => e.property)).not.toContain('window');
  });

  it('rejects a `to` that is strictly after today (UTC)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-13T10:00:00.000Z'));

    const { errors } = await validateDto({ to: '2026-08-14' });

    expect(errors.map((e) => e.property)).toContain('to');
  });

  it("accepts a `to` equal to today's UTC date — the guard is strictly-after, not strictly-before-or-equal", async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-13T10:00:00.000Z'));

    const { errors } = await validateDto({ to: '2026-08-13' });

    expect(errors.map((e) => e.property)).not.toContain('to');
  });

  it('accepts a past `to`', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-13T10:00:00.000Z'));

    const { errors } = await validateDto({ to: '2026-01-01' });

    expect(errors.map((e) => e.property)).not.toContain('to');
  });

  it('accepts `to` omitted entirely — composes with @IsOptional()', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-13T10:00:00.000Z'));

    const { errors } = await validateDto({ window: '1m' });

    expect(errors.map((e) => e.property)).not.toContain('to');
  });

  it('still rejects an unrecognised window value (EARNINGS_WINDOWS remains the whitelist)', async () => {
    const { errors } = await validateDto({ window: 'ytd' });
    expect(errors.map((e) => e.property)).toContain('window');
  });

  it('accepts a well-formed vendorId UUID and rejects a malformed one', async () => {
    const ok = await validateDto({ vendorId: '123e4567-e89b-42d3-a456-426614174000' });
    expect(ok.errors.map((e) => e.property)).not.toContain('vendorId');

    const bad = await validateDto({ vendorId: 'not-a-uuid' });
    expect(bad.errors.map((e) => e.property)).toContain('vendorId');
  });
});
