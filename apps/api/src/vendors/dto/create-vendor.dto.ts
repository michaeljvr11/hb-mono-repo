import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
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
}
