import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

async function validateDto(raw: Record<string, unknown>) {
  const dto = plainToInstance(RegisterDto, raw);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

const BASE = {
  email: 'a@b.com',
  password: 'password1',
  acceptedTerms: true,
};

describe('RegisterDto', () => {
  it('accepts a valid registration with acceptedTerms: true', async () => {
    const { errors } = await validateDto({ ...BASE });
    expect(errors).toHaveLength(0);
  });

  // ─── acceptedTerms — signup consent gate ─────────────────────────────────

  it('rejects acceptedTerms: false', async () => {
    const { errors } = await validateDto({ ...BASE, acceptedTerms: false });
    expect(errors.map((e) => e.property)).toContain('acceptedTerms');
  });

  it('rejects a missing acceptedTerms', async () => {
    const { errors } = await validateDto({ email: 'a@b.com', password: 'password1' });
    expect(errors.map((e) => e.property)).toContain('acceptedTerms');
  });

  it('rejects a non-boolean acceptedTerms', async () => {
    const { errors } = await validateDto({ ...BASE, acceptedTerms: 'yes' });
    expect(errors.map((e) => e.property)).toContain('acceptedTerms');
  });
});
