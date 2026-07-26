import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateVendorRequest, VendorProfileSection } from '@hb/shared';
import { VendorProfileSectionDto } from './vendor-profile-section.dto';

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

  @IsString()
  @IsOptional()
  @MaxLength(120)
  slogan?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => VendorProfileSectionDto)
  profileSections?: VendorProfileSection[];
}
