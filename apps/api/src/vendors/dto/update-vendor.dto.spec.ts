import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateVendorDto } from './update-vendor.dto';

async function validateDto(raw: Record<string, unknown>) {
  const dto = plainToInstance(UpdateVendorDto, raw);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

describe('UpdateVendorDto — notificationEmail (TE-3)', () => {
  it('accepts a valid email override', async () => {
    const { dto, errors } = await validateDto({
      notificationEmail: 'orders@roots-and-shoots.example',
    });

    expect(errors).toHaveLength(0);
    expect(dto.notificationEmail).toBe('orders@roots-and-shoots.example');
  });

  it('rejects a malformed email address', async () => {
    const { errors } = await validateDto({ notificationEmail: 'not-an-email' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('notificationEmail');
  });

  it('allows null (explicit clear) without validation errors', async () => {
    const { dto, errors } = await validateDto({ notificationEmail: null });

    expect(errors).toHaveLength(0);
    expect(dto.notificationEmail).toBeNull();
  });

  it('normalises an empty string to null rather than persisting an empty override', async () => {
    const { dto, errors } = await validateDto({ notificationEmail: '' });

    expect(errors).toHaveLength(0);
    expect(dto.notificationEmail).toBeNull();
  });

  it('allows the field to be entirely omitted (no change intended)', async () => {
    const { dto, errors } = await validateDto({ businessName: 'Renamed' });

    expect(errors).toHaveLength(0);
    expect(dto.notificationEmail).toBeUndefined();
  });
});
