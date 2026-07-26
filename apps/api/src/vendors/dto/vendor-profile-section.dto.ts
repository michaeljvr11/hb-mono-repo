import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { VendorProfileSection } from '@hb/shared';
import type { VendorSectionType } from '@hb/shared';

// Shape/cap validation only. Whether a 'curated' section actually carries
// productIds — and whether those ids belong to the vendor being edited — is a
// semantic, ownership-dependent check enforced in VendorsService.update().
export class VendorProfileSectionDto implements VendorProfileSection {
  @IsString()
  id: string;

  @IsString()
  @MaxLength(120)
  title: string;

  @IsIn(['curated', 'category'])
  type: VendorSectionType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @IsUUID('4', { each: true })
  productIds?: string[];

  @IsOptional()
  @IsUUID('4')
  categoryId?: string;
}
