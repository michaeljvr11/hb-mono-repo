import { AdminVendorDto, CountryCode, VendorProfileSection, VendorStatus } from '@hb/shared';

// Admin-only shape — exposes onboarding fields the public VendorResponseDto hides.
// Only ever returned from admin-gated endpoints.
export class AdminVendorResponseDto implements AdminVendorDto {
  id: string;
  businessName: string;
  tradingName?: string;
  status: VendorStatus;
  countryCode: CountryCode;
  logoUrl?: string;
  bannerUrl?: string;
  slogan?: string;
  profileSections?: VendorProfileSection[];
  registrationNumber?: string;
  website?: string;
  description?: string;
  verificationDocumentUrl?: string;
  appliedAt: string;
}
