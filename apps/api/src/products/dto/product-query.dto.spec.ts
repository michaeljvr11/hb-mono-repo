import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductQueryDto } from './product-query.dto';

// Regression coverage (review WARN 3): a `q` that trims to an empty string
// must become `undefined` after transform, not pass through as ''. An empty
// string previously reached ProductsService.findAll's `ILIKE '%%'` clause,
// which matches every product — an accidental no-op filter that silently
// defeats the caller's (likely mistaken) intent to filter, and is
// inconsistent with "no q supplied at all".
describe('ProductQueryDto', () => {
  function transform(plain: Record<string, unknown>): ProductQueryDto {
    return plainToInstance(ProductQueryDto, plain);
  }

  describe('q transform', () => {
    it('trims surrounding whitespace', () => {
      const dto = transform({ q: '  speaker  ' });
      expect(dto.q).toBe('speaker');
    });

    it('becomes undefined when q is an empty string', () => {
      const dto = transform({ q: '' });
      expect(dto.q).toBeUndefined();
    });

    it('becomes undefined when q trims down to an empty string (whitespace-only)', () => {
      const dto = transform({ q: '   ' });
      expect(dto.q).toBeUndefined();
    });

    it('leaves a single non-whitespace character intact (1-char search stays allowed)', () => {
      const dto = transform({ q: 'a' });
      expect(dto.q).toBe('a');
    });

    it('leaves q undefined when not supplied at all', () => {
      const dto = transform({});
      expect(dto.q).toBeUndefined();
    });

    it('passes non-string values through untouched', () => {
      const dto = transform({ q: 123 });
      expect(dto.q).toBe(123);
    });
  });

  describe('validation', () => {
    it('passes validation when q is omitted', async () => {
      const dto = transform({});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('passes validation when q trims to empty (transformed to undefined before validation)', async () => {
      const dto = transform({ q: '   ' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('passes validation for a 1-character q (no MinLength on the list endpoint)', async () => {
      const dto = transform({ q: 'a' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('fails validation when q exceeds 100 characters', async () => {
      const dto = transform({ q: 'a'.repeat(101) });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('maxLength');
    });

    it('passes validation for a q at exactly the 100 character boundary', async () => {
      const dto = transform({ q: 'a'.repeat(100) });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('page / limit / sort', () => {
    it('coerces page and limit from numeric strings to numbers', () => {
      const dto = transform({ page: '2', limit: '50' });
      expect(dto.page).toBe(2);
      expect(dto.limit).toBe(50);
      expect(typeof dto.page).toBe('number');
      expect(typeof dto.limit).toBe('number');
    });

    it('leaves page, limit and sort undefined when omitted', async () => {
      const dto = transform({});
      expect(dto.page).toBeUndefined();
      expect(dto.limit).toBeUndefined();
      expect(dto.sort).toBeUndefined();
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('passes validation for a valid page and limit', async () => {
      const dto = transform({ page: '1', limit: '24' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it.each(['0', '-1'])('rejects page = %s (below Min(1))', async (value) => {
      const dto = transform({ page: value });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('page');
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it.each(['0', '-1'])('rejects limit = %s (below Min(1))', async (value) => {
      const dto = transform({ limit: value });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('limit');
      expect(errors[0].constraints).toHaveProperty('min');
    });

    it('does not reject a large limit — clamping happens server-side, not via validation', async () => {
      const dto = transform({ limit: '10000' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.limit).toBe(10000);
    });

    it('rejects a non-integer page', async () => {
      const dto = transform({ page: '1.5' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isInt');
    });

    it('rejects a non-numeric page', async () => {
      const dto = transform({ page: 'abc' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isInt');
    });

    it('rejects a non-integer limit', async () => {
      const dto = transform({ limit: '2.5' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isInt');
    });

    it('rejects a non-numeric limit', async () => {
      const dto = transform({ limit: 'abc' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isInt');
    });

    it.each(['newest', 'price_asc', 'price_desc', 'name'])('accepts sort = %s', async (value) => {
      const dto = transform({ sort: value });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.sort).toBe(value);
    });

    it('rejects an invalid sort value', async () => {
      const dto = transform({ sort: 'oldest' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('sort');
      expect(errors[0].constraints).toHaveProperty('isIn');
    });
  });
});
