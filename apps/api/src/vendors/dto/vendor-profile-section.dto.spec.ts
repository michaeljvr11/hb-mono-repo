import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VendorSectionType } from '@hb/shared';
import { VendorProfileSectionDto } from './vendor-profile-section.dto';

async function validateDto(raw: Record<string, unknown>) {
  const dto = plainToInstance(VendorProfileSectionDto, raw);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

const VALID_PRODUCT_ID = '123e4567-e89b-42d3-a456-426614174000';
const VALID_PRODUCT_ID_2 = '223e4567-e89b-42d3-a456-426614174001';
const VALID_CATEGORY_ID = '323e4567-e89b-42d3-a456-426614174002';

const curated = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  title: 'Bestsellers',
  type: VendorSectionType.CURATED,
  productIds: [VALID_PRODUCT_ID],
  ...overrides,
});

const category = (overrides: Record<string, unknown> = {}) => ({
  id: 's2',
  title: 'Home & Living',
  type: VendorSectionType.CATEGORY,
  categoryId: VALID_CATEGORY_ID,
  ...overrides,
});

describe('VendorProfileSectionDto', () => {
  it('accepts a valid curated section', async () => {
    const { errors } = await validateDto(curated());
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid category section', async () => {
    const { errors } = await validateDto(category());
    expect(errors).toHaveLength(0);
  });

  // ─── id / title caps ─────────────────────────────────────────────────

  it('rejects an id over 64 characters', async () => {
    const { errors } = await validateDto(curated({ id: 'a'.repeat(65) }));
    expect(errors.map((e) => e.property)).toContain('id');
  });

  it('accepts an id at exactly 64 characters', async () => {
    const { errors } = await validateDto(curated({ id: 'a'.repeat(64) }));
    expect(errors).toHaveLength(0);
  });

  it('rejects a title over 120 characters (slogan-style cap)', async () => {
    const { errors } = await validateDto(curated({ title: 'a'.repeat(121) }));
    expect(errors.map((e) => e.property)).toContain('title');
  });

  it('accepts a title at exactly 120 characters', async () => {
    const { errors } = await validateDto(curated({ title: 'a'.repeat(120) }));
    expect(errors).toHaveLength(0);
  });

  // ─── type ────────────────────────────────────────────────────────────

  it('rejects an unknown section type', async () => {
    const { errors } = await validateDto(curated({ type: 'rule' }));
    expect(errors.map((e) => e.property)).toContain('type');
  });

  // ─── productIds cap ──────────────────────────────────────────────────

  it('accepts a curated section with 24 productIds (the cap)', async () => {
    const productIds = Array.from(
      { length: 24 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const { errors } = await validateDto(curated({ productIds }));
    expect(errors).toHaveLength(0);
  });

  it('rejects a curated section with 25 productIds (over the cap)', async () => {
    const productIds = Array.from(
      { length: 25 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const { errors } = await validateDto(curated({ productIds }));
    expect(errors.map((e) => e.property)).toContain('productIds');
  });

  it('rejects a non-uuid productId', async () => {
    const { errors } = await validateDto(curated({ productIds: ['not-a-uuid'] }));
    expect(errors.map((e) => e.property)).toContain('productIds');
  });

  // ─── cross-field: curated ↔ productIds, category ↔ categoryId ────────

  it('rejects a curated section with no productIds', async () => {
    const { errors } = await validateDto(curated({ productIds: undefined }));
    expect(errors.map((e) => e.property)).toContain('productIds');
  });

  it('rejects a curated section with an empty productIds array', async () => {
    const { errors } = await validateDto(curated({ productIds: [] }));
    expect(errors.map((e) => e.property)).toContain('productIds');
  });

  it('rejects a curated section that also carries a categoryId', async () => {
    const { errors } = await validateDto(curated({ categoryId: VALID_CATEGORY_ID }));
    expect(errors.map((e) => e.property)).toContain('categoryId');
  });

  it('rejects a category section with no categoryId', async () => {
    const { errors } = await validateDto(category({ categoryId: undefined }));
    expect(errors.map((e) => e.property)).toContain('categoryId');
  });

  it('rejects a category section with an invalid categoryId', async () => {
    const { errors } = await validateDto(category({ categoryId: 'not-a-uuid' }));
    expect(errors.map((e) => e.property)).toContain('categoryId');
  });

  it('rejects a category section that also carries productIds — the structural bypass this DTO must close', async () => {
    const { errors } = await validateDto(
      category({ productIds: [VALID_PRODUCT_ID, VALID_PRODUCT_ID_2] }),
    );
    expect(errors.map((e) => e.property)).toContain('productIds');
  });
});
