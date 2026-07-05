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
});
