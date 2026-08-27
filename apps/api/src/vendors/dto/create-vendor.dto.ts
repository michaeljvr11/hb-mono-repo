import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, Equals } from 'class-validator';
import { CountryCode, CreateVendorRequest } from '@hb/shared';

export class CreateVendorDto implements CreateVendorRequest {
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @IsString()
  @IsOptional()
  tradingName?: string;

  @IsString()
  @IsOptional()
  registrationNumber?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(CountryCode)
  @IsOptional()
  countryCode?: CountryCode;

  // Same shape as RegisterDto.acceptedTerms (LC-3): @IsBoolean rejects a
  // non-boolean, @Equals(true) rejects an explicit `false`, so "I agree to the
  // Vendor Agreement" cannot be satisfied by omitting or unticking the box.
  @IsBoolean()
  @Equals(true)
  acceptedTerms: boolean;
}
