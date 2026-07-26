import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { ProductQuery } from '@hb/shared';
import type { ProductSort } from '@hb/shared';

const PRODUCT_SORT_VALUES: ProductSort[] = ['newest', 'price_asc', 'price_desc', 'name'];

export class ProductQueryDto implements ProductQuery {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  q?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  // No @Max here — a large limit is clamped server-side (ProductsService), not rejected.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsIn(PRODUCT_SORT_VALUES)
  sort?: ProductSort;
}
