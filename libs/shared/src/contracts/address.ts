import { CountryCode } from '../enums';

/** Shipping/billing address input (checkout capture). */
export interface CreateAddressRequest {
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
