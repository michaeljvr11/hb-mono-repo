import { CountryCode, VendorStatus } from '../enums';

export interface VendorDto {
  id: string;
  businessName: string;
  tradingName?: string;
  status: VendorStatus;
  countryCode: CountryCode;
}

export interface CreateVendorRequest {
  businessName: string;
  tradingName?: string;
  registrationNumber?: string;
  website?: string;
  description?: string;
  countryCode?: CountryCode;
}

export interface AdminCreateVendorRequest extends CreateVendorRequest {
  userId?: string;
  status?: VendorStatus;
}

export interface UpdateVendorRequest {
  businessName?: string;
  tradingName?: string;
  website?: string;
  description?: string;
}

export interface UpdateVendorStatusRequest {
  status: Exclude<VendorStatus, 'pending'>;
}
