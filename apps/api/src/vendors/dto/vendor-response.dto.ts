import {
  CountryCode,
  UploadedImageDto,
  VendorDto,
  VendorProfileSection,
  VendorStatus,
} from '@hb/shared';

// Public shape only — never expose registrationNumber, verification docs, bank details.
export class VendorResponseDto implements VendorDto {
  id: string;
  businessName: string;
  tradingName?: string;
  status: VendorStatus;
  countryCode: CountryCode;
  logoUrl?: string;
  logo?: UploadedImageDto;
  bannerUrl?: string;
  banner?: UploadedImageDto;
  slogan?: string;
  profileSections?: VendorProfileSection[];
}
