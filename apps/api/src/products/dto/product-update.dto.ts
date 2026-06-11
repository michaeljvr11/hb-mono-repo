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

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  @Type(() => String)
  categoryIds?: string[];
}
