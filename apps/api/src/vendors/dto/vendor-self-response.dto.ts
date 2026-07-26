import { CountryCode, VendorProfileSection, VendorSelfDto, VendorStatus } from '@hb/shared';

// Owner self-view — only ever returned from the owner-gated GET /vendors/me route.
// Widens the public VendorResponseDto shape with the vendor's own editable fields.
export class VendorSelfResponseDto implements VendorSelfDto {
  id: string;
  businessName: string;
  tradingName?: string;
  status: VendorStatus;
  countryCode: CountryCode;
  logoUrl?: string;
  bannerUrl?: string;
  slogan?: string;
  profileSections?: VendorProfileSection[];
  website?: string;
  description?: string;
}
