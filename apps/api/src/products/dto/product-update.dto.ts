import {
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  IsArray,
  IsUUID,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CountryCode, CurrencyCode, ProductUpdateRequest } from '@hb/shared';
import { ProductSizeInputDto } from './product-size-input.dto';

export class ProductUpdateDto implements ProductUpdateRequest {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber({}, { message: 'Price must be a number' })
  @IsPositive({ message: 'Price must be greater than 0' })
  @IsOptional()
  @Type(() => Number)
  price?: number;

  @IsEnum(CurrencyCode)
  @IsOptional()
  currency?: CurrencyCode;

  @IsNumber({}, { message: 'Stock quantity must be a number' })
  @IsOptional()
  @Type(() => Number)
  stockQuantity?: number;

  @IsEnum(CountryCode)
  @IsOptional()
  originCountry?: CountryCode;

  // No `vendorId`: a product's owning vendor is never client-settable on update.
  // It was accepted-but-ignored before (see docs/security L1); removing it stops a
  // future refactor from silently enabling cross-vendor reassignment.

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  @Type(() => String)
  categoryIds?: string[];

  /**
   * Whole-list replace on update (matches `categoryIds`): present (even `[]`)
   * replaces the full size set — `[]` makes the product unsized; absent
   * leaves existing sizes untouched.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSizeInputDto)
  sizes?: ProductSizeInputDto[];
}
