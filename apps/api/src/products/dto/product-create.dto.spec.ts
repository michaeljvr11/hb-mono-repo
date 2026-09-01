import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductCreateDto } from './product-create.dto';

/**
 * `sizes` arrives as a real array on JSON-body requests (product create
 * without images), but as a JSON-stringified string on multipart requests
 * (product create WITH images — see the web `ProductsService.toFormData()`,
 * which appends `sizes` via `JSON.stringify`). Multer/Nest give every
 * multipart field as a string, so without the `@Transform` on
 * `ProductCreateDto.sizes` this fails validation outright. Pins the bug
 * (code review FAIL 1) and proves the fix.
 */
describe('ProductCreateDto — sizes field (multipart vs JSON body)', () => {
  const base = {
    name: 'Fynbos Honey',
    description: 'Organic honey',
    price: 185,
  };

  function transform(plain: Record<string, unknown>): ProductCreateDto {
    return plainToInstance(ProductCreateDto, plain);
  }

  it('parses a JSON-stringified sizes array (multipart form-data path) and validates it', async () => {
    const dto = transform({
      ...base,
      sizes: JSON.stringify([
        { label: 'Small', stockQuantity: 3, displayOrder: 0 },
        { label: 'Large', stockQuantity: 7, displayOrder: 1 },
      ]),
    });

    const errors = await validate(dto, { whitelist: true });
    expect(errors).toHaveLength(0);
    expect(dto.sizes).toEqual([
      expect.objectContaining({ label: 'Small', stockQuantity: 3, displayOrder: 0 }),
      expect.objectContaining({ label: 'Large', stockQuantity: 7, displayOrder: 1 }),
    ]);
  });

  it('leaves a real array unchanged (JSON-body request path, no images)', async () => {
    const dto = transform({
      ...base,
      sizes: [{ label: 'Medium', stockQuantity: 5, displayOrder: 0 }],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.sizes).toEqual([
      expect.objectContaining({ label: 'Medium', stockQuantity: 5, displayOrder: 0 }),
    ]);
  });

  it('fails validation cleanly (400-shaped, not a crash) on malformed JSON', async () => {
    const dto = transform({ ...base, sizes: '{not valid json' });

    const errors = await validate(dto);
    const sizesError = errors.find((e) => e.property === 'sizes');
    expect(sizesError).toBeDefined();
    expect(sizesError?.constraints).toHaveProperty('isArray');
  });

  it('passes validation when sizes is omitted entirely', async () => {
    const dto = transform({ ...base });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
