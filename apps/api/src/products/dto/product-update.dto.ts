import {
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  IsArray,
  IsUUID,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CountryCode, CurrencyCode, ProductUpdateRequest } from '@hb/shared';

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
}
