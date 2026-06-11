import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsArray,
  IsUUID,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CountryCode, CurrencyCode, ProductCreateRequest } from '@hb/shared';

export class ProductCreateDto implements ProductCreateRequest {
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  description: string;

  @IsNumber({}, { message: 'Price must be a number' })
  @IsPositive({ message: 'Price must be greater than 0' })
  @Type(() => Number)
  price: number;

  @IsEnum(CurrencyCode)
  @IsOptional()
  currency?: CurrencyCode;

  @IsNumber({}, { message: 'Stock quantity must be a number' })
  @IsOptional()
  @Type(() => Number)
  stockQuantity?: number = 0;

  @IsEnum(CountryCode)
  @IsOptional()
  originCountry?: CountryCode;

  @IsOptional()
  @IsString()
  vendorId?: string; // set from auth context; override allowed for admin flows

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  @Type(() => String)
  categoryIds?: string[];
}
