import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
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

  // Owner-editable notification-email override (TE-3). Format validation only
  // (@IsEmail) — this is operational config, not an auth identity, so the
  // isVerified machinery is deliberately not reused. null/'' clear the
  // override and fall back to the account email at read time; '' is
  // normalised to null here so VendorsService.update's Object.assign never
  // persists an empty string.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @ValidateIf((dto: UpdateVendorDto) => dto.notificationEmail !== null)
  @IsEmail({}, { message: 'notificationEmail must be a valid email address' })
  notificationEmail?: string | null;
}
