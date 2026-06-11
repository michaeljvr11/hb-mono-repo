import { CountryCode, VendorDto, VendorStatus } from '@hb/shared';

// Public shape only — never expose registrationNumber, verification docs, bank details.
export class VendorResponseDto implements VendorDto {
  id: string;
  businessName: string;
  tradingName?: string;
  status: VendorStatus;
  countryCode: CountryCode;
}
