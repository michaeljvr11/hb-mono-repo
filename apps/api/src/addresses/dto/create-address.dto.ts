import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CountryCode, CreateAddressRequest } from '@hb/shared';

export class CreateAddressDto implements CreateAddressRequest {
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
 * Partial update — every field optional. Declared explicitly rather than via
 * `PartialType` since neither `@nestjs/mapped-types` nor `@nestjs/swagger` is
 * installed in this app (no other DTO in the repo uses it either).
 */
export class UpdateAddressDto implements Partial<CreateAddressRequest> {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Recipient name is required' })
  recipientName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Street address is required' })
  line1?: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsEnum(CountryCode, { message: 'Country must be ZA or NA' })
  countryCode?: CountryCode;

  @IsOptional()
  @IsString()
  phone?: string;
}
