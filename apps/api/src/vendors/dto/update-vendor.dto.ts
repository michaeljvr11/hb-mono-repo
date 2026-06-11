import { IsString, IsOptional } from 'class-validator';
import { UpdateVendorRequest } from '@hb/shared';

export class UpdateVendorDto implements UpdateVendorRequest {
  @IsString()
  @IsOptional()
  businessName?: string;

  @IsString()
  @IsOptional()
  tradingName?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
