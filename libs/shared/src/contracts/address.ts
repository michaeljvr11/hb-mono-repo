import { CountryCode } from '../enums';

export interface AddressDto {
  id: string;
  recipientName: string;
  line1: string;
  line2?: string;
  city: string;
  /** Province (ZA) or region (NA). */
  region?: string;
  postalCode?: string;
  countryCode: CountryCode;
  phone?: string;
}
