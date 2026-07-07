import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CountryCode, CreateAddressRequest, CreateOrderRequest } from '@hb/shared';

export class CreateOrderAddressDto implements CreateAddressRequest {
  @IsString()
  @IsNotEmpty({ message: 'Recipient name is required' })
  recipientName: string;

  @IsString()
  @IsNotEmpty({ message: 'Street address is required' })
  line1: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  city: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsEnum(CountryCode, { message: 'Country must be ZA or NA' })
  countryCode: CountryCode;

  @IsOptional()
  @IsString()
  phone?: string;
}

/**
 * Checkout submission. Deliberately carries NO amounts and NO line items —
 * lines come from the caller's server-side cart and every total is computed
 * server-side from live product prices.
 */
export class CreateOrderDto implements CreateOrderRequest {
  @IsObject({ message: 'Shipping address is required' })
  @ValidateNested()
  @Type(() => CreateOrderAddressDto)
  shippingAddress: CreateOrderAddressDto;
}
