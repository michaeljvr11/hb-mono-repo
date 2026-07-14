import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { ProductSearchQuery, ProductSearchSort } from '@hb/shared';

export const SEARCH_MAX_PAGE_SIZE = 100;
export const SEARCH_DEFAULT_PAGE_SIZE = 20;

/**
 * Price-range coherence: maxPrice must be >= minPrice when both are present.
 * Individually each bound only needs to be >= 0; an inverted range is a
 * caller bug and must 400 rather than silently return nothing.
 */
@ValidatorConstraint({ name: 'maxPriceGteMinPrice', async: false })
export class MaxPriceGteMinPriceConstraint implements ValidatorConstraintInterface {
  validate(maxPrice: unknown, args: ValidationArguments): boolean {
    const { minPrice } = args.object as ProductSearchQueryDto;
    if (typeof maxPrice !== 'number' || typeof minPrice !== 'number') return true;
    return maxPrice >= minPrice;
  }

  defaultMessage(): string {
    return 'maxPrice must be greater than or equal to minPrice';
  }
}

const toOptionalBoolean = ({ value }: TransformFnParams): unknown => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export class ProductSearchQueryDto implements ProductSearchQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Validate(MaxPriceGteMinPriceConstraint)
  maxPrice?: number;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  inStockOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_MAX_PAGE_SIZE)
  pageSize?: number = SEARCH_DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsIn(Object.values(ProductSearchSort))
  sort?: ProductSearchSort;
}
