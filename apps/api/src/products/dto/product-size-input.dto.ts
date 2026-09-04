import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductSizeInput } from '@hb/shared';

/**
 * One entry of `ProductCreateDto.sizes` / `ProductUpdateDto.sizes`. Per-field
 * validation only — uniqueness of `label` within a product is a cross-row
 * check done in `ProductsService` (mirrors the existing `categoryIds`
 * existence check), not expressible as a per-field decorator here.
 */
export class ProductSizeInputDto implements ProductSizeInput {
  @IsString()
  @IsNotEmpty({ message: 'Size label is required' })
  label: string;

  @IsInt({ message: 'Stock quantity must be a whole number' })
  @Min(0, { message: 'Stock quantity cannot be negative' })
  @Type(() => Number)
  stockQuantity: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  displayOrder?: number;
}
