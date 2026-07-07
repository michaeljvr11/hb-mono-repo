import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductSearchSort } from '@hb/shared';
import { ProductSearchQueryDto, SEARCH_MAX_PAGE_SIZE } from './product-search-query.dto';

// Mirrors the global ValidationPipe config (whitelist + transform) so these
// tests exercise the exact behavior requests hit in production.
async function validateQuery(raw: Record<string, unknown>) {
  const dto = plainToInstance(ProductSearchQueryDto, raw);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

describe('ProductSearchQueryDto', () => {
  it('accepts a fully-populated valid query and coerces string params', async () => {
    const { dto, errors } = await validateQuery({
      q: '  vitamin c serum ',
      categoryId: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
      vendorId: 'b3bb189e-8bf9-3888-9912-ace4e6543002',
      minPrice: '10',
      maxPrice: '99.99',
      inStockOnly: 'true',
      page: '2',
      pageSize: '50',
      sort: ProductSearchSort.PRICE_ASC,
    });

    expect(errors).toHaveLength(0);
    expect(dto.q).toBe('vitamin c serum'); // trimmed
    expect(dto.minPrice).toBe(10);
    expect(dto.maxPrice).toBe(99.99);
    expect(dto.inStockOnly).toBe(true);
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(50);
  });

  it('accepts an empty query (browse-all) and applies pagination defaults', async () => {
    const { dto, errors } = await validateQuery({});

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
  });

  it('rejects a negative minPrice', async () => {
    const { errors } = await validateQuery({ minPrice: '-1' });
    expect(errors.map((e) => e.property)).toContain('minPrice');
  });

  it('rejects a negative maxPrice', async () => {
    const { errors } = await validateQuery({ maxPrice: '-0.01' });
    expect(errors.map((e) => e.property)).toContain('maxPrice');
  });

  it('rejects an inverted price range (maxPrice < minPrice)', async () => {
    const { errors } = await validateQuery({ minPrice: '100', maxPrice: '50' });
    const maxPriceError = errors.find((e) => e.property === 'maxPrice');
    expect(maxPriceError).toBeDefined();
    expect(Object.keys(maxPriceError.constraints ?? {})).toContain('maxPriceGteMinPrice');
  });

  it('accepts an equal price range (maxPrice === minPrice)', async () => {
    const { errors } = await validateQuery({ minPrice: '50', maxPrice: '50' });
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown sort value', async () => {
    const { errors } = await validateQuery({ sort: 'cheapestFirst' });
    expect(errors.map((e) => e.property)).toContain('sort');
  });

  it.each(Object.values(ProductSearchSort))('accepts sort=%s', async (sort) => {
    const { errors } = await validateQuery({ sort });
    expect(errors).toHaveLength(0);
  });

  it(`rejects pageSize above the ${SEARCH_MAX_PAGE_SIZE} cap`, async () => {
    const { errors } = await validateQuery({ pageSize: String(SEARCH_MAX_PAGE_SIZE + 1) });
    expect(errors.map((e) => e.property)).toContain('pageSize');
  });

  it('rejects page 0 and non-integer pagination', async () => {
    const { errors } = await validateQuery({ page: '0', pageSize: '2.5' });
    const props = errors.map((e) => e.property);
    expect(props).toContain('page');
    expect(props).toContain('pageSize');
  });

  it('rejects a non-UUID categoryId and vendorId', async () => {
    const { errors } = await validateQuery({ categoryId: 'nope', vendorId: '123' });
    const props = errors.map((e) => e.property);
    expect(props).toContain('categoryId');
    expect(props).toContain('vendorId');
  });

  it('rejects a non-boolean inStockOnly', async () => {
    const { errors } = await validateQuery({ inStockOnly: 'yes' });
    expect(errors.map((e) => e.property)).toContain('inStockOnly');
  });

  it('whitelist strips unknown fields', async () => {
    const { dto, errors } = await validateQuery({ q: 'serum', adminOnly: 'true' });
    expect(errors).toHaveLength(0);
    expect((dto as Record<string, unknown>).adminOnly).toBeUndefined();
  });
});
