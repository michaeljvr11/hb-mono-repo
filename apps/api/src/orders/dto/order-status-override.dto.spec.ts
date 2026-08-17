import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrderStatus } from '@hb/shared';
import { OrderStatusOverrideDto } from './order-status-override.dto';

async function validateDto(raw: Record<string, unknown>) {
  const dto = plainToInstance(OrderStatusOverrideDto, raw);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

describe('OrderStatusOverrideDto', () => {
  const validPayload = {
    status: OrderStatus.CONFIRMED,
    reason: 'Support ticket #123 — customer confirmed receipt',
    sendNotifications: false,
  };

  it('accepts a valid payload', async () => {
    const { errors } = await validateDto(validPayload);

    expect(errors).toHaveLength(0);
  });

  it('rejects an empty reason', async () => {
    const { errors } = await validateDto({ ...validPayload, reason: '' });

    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('rejects a whitespace-only reason (trimmed before validation)', async () => {
    const { errors } = await validateDto({ ...validPayload, reason: '   \t  ' });

    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('rejects a reason longer than 2000 characters', async () => {
    const { errors } = await validateDto({ ...validPayload, reason: 'x'.repeat(2001) });

    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('accepts a reason exactly 2000 characters long', async () => {
    const { errors } = await validateDto({ ...validPayload, reason: 'x'.repeat(2000) });

    expect(errors).toHaveLength(0);
  });

  it('rejects a missing sendNotifications (no server-side default)', async () => {
    const { errors } = await validateDto({
      status: OrderStatus.CONFIRMED,
      reason: 'test',
    });

    expect(errors.some((e) => e.property === 'sendNotifications')).toBe(true);
  });

  it('rejects an unknown status string', async () => {
    const { errors } = await validateDto({ ...validPayload, status: 'not-a-real-status' });

    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('trims a valid reason with surrounding whitespace', async () => {
    const { dto, errors } = await validateDto({
      ...validPayload,
      reason: '  Manual delivery confirmation  ',
    });

    expect(errors).toHaveLength(0);
    expect(dto.reason).toBe('Manual delivery confirmation');
  });
});
