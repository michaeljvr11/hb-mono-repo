import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  SYNONYM_EQUIVALENTS_MAX,
  SYNONYM_TERM_MAX_LENGTH,
  SynonymCreateDto,
} from './synonym-create.dto';

async function validateDto(raw: Record<string, unknown>) {
  const dto = plainToInstance(SynonymCreateDto, raw);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

describe('SynonymCreateDto', () => {
  it('accepts a valid create request and normalizes casing/whitespace', async () => {
    const { dto, errors } = await validateDto({
      term: '  SPF  ',
      equivalents: [' Sunscreen ', 'SUNBLOCK'],
      bidirectional: true,
      enabled: true,
    });

    expect(errors).toHaveLength(0);
    expect(dto.term).toBe('spf');
    expect(dto.equivalents).toEqual(['sunscreen', 'sunblock']);
  });

  it('defaults bidirectional/enabled to undefined when omitted (service applies the true default)', async () => {
    const { dto, errors } = await validateDto({ term: 'spf', equivalents: ['sunscreen'] });

    expect(errors).toHaveLength(0);
    expect(dto.bidirectional).toBeUndefined();
    expect(dto.enabled).toBeUndefined();
  });

  it('rejects an empty term', async () => {
    const { errors } = await validateDto({ term: '', equivalents: ['sunscreen'] });
    expect(errors.map((e) => e.property)).toContain('term');
  });

  it('rejects a whitespace-only term (normalizes to empty before length check)', async () => {
    const { errors } = await validateDto({ term: '   ', equivalents: ['sunscreen'] });
    expect(errors.map((e) => e.property)).toContain('term');
  });

  it('rejects a term over the max length', async () => {
    const { errors } = await validateDto({
      term: 'a'.repeat(SYNONYM_TERM_MAX_LENGTH + 1),
      equivalents: ['sunscreen'],
    });
    expect(errors.map((e) => e.property)).toContain('term');
  });

  it('rejects an empty equivalents array', async () => {
    const { errors } = await validateDto({ term: 'spf', equivalents: [] });
    expect(errors.map((e) => e.property)).toContain('equivalents');
  });

  it('rejects an equivalents array containing an empty string', async () => {
    const { errors } = await validateDto({ term: 'spf', equivalents: ['sunscreen', ''] });
    expect(errors.map((e) => e.property)).toContain('equivalents');
  });

  it('rejects an equivalents array containing a whitespace-only string', async () => {
    const { errors } = await validateDto({ term: 'spf', equivalents: ['sunscreen', '   '] });
    expect(errors.map((e) => e.property)).toContain('equivalents');
  });

  it('rejects duplicate equivalents (case-insensitive, post-normalization)', async () => {
    const { errors } = await validateDto({ term: 'spf', equivalents: ['Sunscreen', 'sunscreen'] });
    expect(errors.map((e) => e.property)).toContain('equivalents');
  });

  it('rejects more than the max number of equivalents', async () => {
    const equivalents = Array.from({ length: SYNONYM_EQUIVALENTS_MAX + 1 }, (_, i) => `term${i}`);
    const { errors } = await validateDto({ term: 'spf', equivalents });
    expect(errors.map((e) => e.property)).toContain('equivalents');
  });

  it('rejects a non-boolean bidirectional/enabled', async () => {
    const { errors } = await validateDto({
      term: 'spf',
      equivalents: ['sunscreen'],
      bidirectional: 'yes',
      enabled: 'no',
    });
    const props = errors.map((e) => e.property);
    expect(props).toContain('bidirectional');
    expect(props).toContain('enabled');
  });

  it('whitelist strips unknown fields', async () => {
    const { dto, errors } = await validateDto({
      term: 'spf',
      equivalents: ['sunscreen'],
      admin: true,
    });
    expect(errors).toHaveLength(0);
    expect((dto as unknown as Record<string, unknown>).admin).toBeUndefined();
  });
});
