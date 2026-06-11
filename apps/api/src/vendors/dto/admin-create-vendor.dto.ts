import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { AdminCreateVendorRequest, CountryCode, VendorStatus } from '@hb/shared';

export class AdminCreateVendorDto implements AdminCreateVendorRequest {
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

  // Admin can link an existing user or leave null (pending onboarding)
  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsEnum(VendorStatus)
  @IsOptional()
  status?: VendorStatus = VendorStatus.PENDING;
}
