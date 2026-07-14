import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SynonymUpdateDto } from './synonym-update.dto';

async function validateDto(raw: Record<string, unknown>) {
  const dto = plainToInstance(SynonymUpdateDto, raw);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

describe('SynonymUpdateDto', () => {
  it('accepts an empty patch (no-op update)', async () => {
    const { errors } = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('accepts a partial patch of just enabled', async () => {
    const { dto, errors } = await validateDto({ enabled: false });
    expect(errors).toHaveLength(0);
    expect(dto.enabled).toBe(false);
  });

  it('normalizes term and equivalents when provided', async () => {
    const { dto, errors } = await validateDto({ term: ' Colour ', equivalents: [' Color '] });
    expect(errors).toHaveLength(0);
    expect(dto.term).toBe('colour');
    expect(dto.equivalents).toEqual(['color']);
  });

  it('rejects an empty term when provided', async () => {
    const { errors } = await validateDto({ term: '' });
    expect(errors.map((e) => e.property)).toContain('term');
  });

  it('rejects an empty equivalents array when provided', async () => {
    const { errors } = await validateDto({ equivalents: [] });
    expect(errors.map((e) => e.property)).toContain('equivalents');
  });

  it('rejects duplicate equivalents when provided', async () => {
    const { errors } = await validateDto({ equivalents: ['color', 'COLOR'] });
    expect(errors.map((e) => e.property)).toContain('equivalents');
  });

  it('rejects a non-boolean bidirectional', async () => {
    const { errors } = await validateDto({ bidirectional: 'nope' });
    expect(errors.map((e) => e.property)).toContain('bidirectional');
  });

  it('whitelist strips unknown fields', async () => {
    const { dto, errors } = await validateDto({ enabled: true, hacker: true });
    expect(errors).toHaveLength(0);
    expect((dto as Record<string, unknown>).hacker).toBeUndefined();
  });
});
