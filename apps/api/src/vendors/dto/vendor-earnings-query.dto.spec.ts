import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VendorEarningsQueryDto } from './vendor-earnings-query.dto';

async function validateDto(raw: Record<string, unknown>) {
  const dto = plainToInstance(VendorEarningsQueryDto, raw);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

describe('VendorEarningsQueryDto validation', () => {
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

  it('accepts `to` omitted entirely — composes with @IsOptional()', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-13T10:00:00.000Z'));

    const { errors } = await validateDto({ window: '1m' });

    expect(errors.map((e) => e.property)).not.toContain('to');
  });

  it("has no vendorId field — a client-supplied one is silently stripped by the global ValidationPipe's whitelist, never validated or echoed back", async () => {
    const { dto, errors } = await validateDto({ vendorId: 'some-id' });

    expect(errors).toHaveLength(0); // whitelist strips unknown props; it doesn't reject the request
    expect((dto as unknown as Record<string, unknown>).vendorId).toBeUndefined();
  });
});
