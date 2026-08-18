import {
  AdminVendorDto,
  CountryCode,
  UploadedImageDto,
  VendorProfileSection,
  VendorStatus,
} from '@hb/shared';

// Admin-only shape — exposes onboarding fields the public VendorResponseDto hides.
// Only ever returned from admin-gated endpoints.
export class AdminVendorResponseDto implements AdminVendorDto {
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
  registrationNumber?: string;
  website?: string;
  description?: string;
  verificationDocumentUrl?: string;
  appliedAt: string;
}
