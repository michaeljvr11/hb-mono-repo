import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductSizeInputDto } from './product-size-input.dto';

describe('ProductSizeInputDto', () => {
  function transform(plain: Record<string, unknown>): ProductSizeInputDto {
    return plainToInstance(ProductSizeInputDto, plain);
  }

  it('passes validation for a valid size entry', async () => {
    const dto = transform({ label: 'Medium', stockQuantity: 5, displayOrder: 0 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes validation when displayOrder is omitted (defaulted by the service, not the DTO)', async () => {
    const dto = transform({ label: 'Medium', stockQuantity: 5 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty label', async () => {
    const dto = transform({ label: '', stockQuantity: 5 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'label')).toBe(true);
  });

  it('rejects a missing label', async () => {
    const dto = transform({ stockQuantity: 5 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'label')).toBe(true);
  });

  it('rejects negative stockQuantity', async () => {
    const dto = transform({ label: 'Medium', stockQuantity: -1 });
    const errors = await validate(dto);
    const stockError = errors.find((e) => e.property === 'stockQuantity');
    expect(stockError).toBeDefined();
    expect(stockError?.constraints).toHaveProperty('min');
  });

  it('rejects a non-integer stockQuantity', async () => {
    const dto = transform({ label: 'Medium', stockQuantity: 1.5 });
    const errors = await validate(dto);
    const stockError = errors.find((e) => e.property === 'stockQuantity');
    expect(stockError).toBeDefined();
    expect(stockError?.constraints).toHaveProperty('isInt');
  });

  it('accepts stockQuantity of exactly 0', async () => {
    const dto = transform({ label: 'Medium', stockQuantity: 0 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a negative displayOrder', async () => {
    const dto = transform({ label: 'Medium', stockQuantity: 5, displayOrder: -1 });
    const errors = await validate(dto);
    const orderError = errors.find((e) => e.property === 'displayOrder');
    expect(orderError).toBeDefined();
    expect(orderError?.constraints).toHaveProperty('min');
  });
});
