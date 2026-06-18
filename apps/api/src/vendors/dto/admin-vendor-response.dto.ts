import { AdminVendorDto, CountryCode, VendorStatus } from '@hb/shared';

// Admin-only shape — exposes onboarding fields the public VendorResponseDto hides.
// Only ever returned from admin-gated endpoints.
export class AdminVendorResponseDto implements AdminVendorDto {
  id: string;
  businessName: string;
  tradingName?: string;
  status: VendorStatus;
  countryCode: CountryCode;
  registrationNumber?: string;
  website?: string;
  description?: string;
  verificationDocumentUrl?: string;
  appliedAt: string;
}
