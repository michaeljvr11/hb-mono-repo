import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalyticsEventType, CurrencyCode } from '@hb/shared';
import { CreateAnalyticsEventDto } from './create-analytics-event.dto';

async function validateDto(raw: Record<string, unknown>) {
  const dto = plainToInstance(CreateAnalyticsEventDto, raw);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

const BASE = {
  type: AnalyticsEventType.PRODUCT_VIEWED,
  sessionId: 'session-abc-123',
  occurredAt: '2026-07-17T09:00:00.000Z',
};

describe('CreateAnalyticsEventDto', () => {
  it('accepts a minimal valid non-monetary event', async () => {
    const { errors } = await validateDto({ ...BASE });
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid monetary event with value + currency', async () => {
    const { errors } = await validateDto({
      ...BASE,
      type: AnalyticsEventType.ORDER_COMPLETED,
      orderId: '123e4567-e89b-12d3-a456-426614174000',
      value: 249.99,
      currency: CurrencyCode.ZAR,
    });
    expect(errors).toHaveLength(0);
  });

  // ─── money: currency required whenever value is present ─────────────────

  it('rejects value without currency', async () => {
    const { errors } = await validateDto({ ...BASE, value: 100 });
    expect(errors.map((e) => e.property)).toContain('currency');
  });

  it('rejects an unknown currency code even without a value', async () => {
    const { errors } = await validateDto({ ...BASE, currency: 'USD' });
    expect(errors.map((e) => e.property)).toContain('currency');
  });

  it('rejects a negative value', async () => {
    const { errors } = await validateDto({ ...BASE, value: -5, currency: CurrencyCode.ZAR });
    expect(errors.map((e) => e.property)).toContain('value');
  });

  it('rejects a value with more than 2 decimal places', async () => {
    const { errors } = await validateDto({ ...BASE, value: 10.999, currency: CurrencyCode.ZAR });
    expect(errors.map((e) => e.property)).toContain('value');
  });

  // ─── other fields ─────────────────────────────────────────────────────

  it('rejects an unknown event type', async () => {
    const { errors } = await validateDto({ ...BASE, type: 'not_a_real_event' });
    expect(errors.map((e) => e.property)).toContain('type');
  });

  it('rejects a missing sessionId', async () => {
    const { errors } = await validateDto({ ...BASE, sessionId: undefined });
    expect(errors.map((e) => e.property)).toContain('sessionId');
  });

  it('rejects a sessionId over 64 characters', async () => {
    const { errors } = await validateDto({ ...BASE, sessionId: 'a'.repeat(65) });
    expect(errors.map((e) => e.property)).toContain('sessionId');
  });

  it('rejects a non-uuid productId', async () => {
    const { errors } = await validateDto({ ...BASE, productId: 'not-a-uuid' });
    expect(errors.map((e) => e.property)).toContain('productId');
  });

  it('rejects a non-ISO occurredAt', async () => {
    const { errors } = await validateDto({ ...BASE, occurredAt: 'not-a-date' });
    expect(errors.map((e) => e.property)).toContain('occurredAt');
  });

  it('whitelist strips unknown fields (e.g. a spoofed userId)', async () => {
    const { dto, errors } = await validateDto({ ...BASE, userId: 'user-1' });
    expect(errors).toHaveLength(0);
    expect((dto as unknown as Record<string, unknown>).userId).toBeUndefined();
  });
});
