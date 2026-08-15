import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
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
  // @IsOptional() already short-circuits every validator below it for null and
  // undefined alike, so the cleared case never reaches @IsEmail.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @IsEmail({}, { message: 'notificationEmail must be a valid email address' })
  notificationEmail?: string | null;
}
