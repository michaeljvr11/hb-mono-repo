import { CountryCode, CurrencyCode, OrderStatus, VendorSectionType, VendorStatus } from '../enums';

export interface VendorProfileSection {
  id: string;
  title: string;
  type: VendorSectionType;
  productIds?: string[]; // curated: ordered, hand-picked, vendor-owned
  categoryId?: string; // category: auto-fills from the vendor's products
}

export interface VendorDto {
  id: string;
  businessName: string;
  tradingName?: string;
  status: VendorStatus;
  countryCode: CountryCode;
  logoUrl?: string;
  bannerUrl?: string;
  slogan?: string;
  profileSections?: VendorProfileSection[];
}

export interface AdminVendorDto extends VendorDto {
  registrationNumber?: string;
  website?: string;
  description?: string;
  verificationDocumentUrl?: string;
  appliedAt: string; // ISO timestamp of when the vendor applied (createdAt)
}

// Owner self-view: the public shape plus the vendor's own editable fields
// (website/description). Returned only from the owner-gated GET /vendors/me route.
export interface VendorSelfDto extends VendorDto {
  website?: string;
  description?: string;
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
  slogan?: string;
  profileSections?: VendorProfileSection[];
}

export interface UpdateVendorStatusRequest {
  status: Exclude<VendorStatus, 'pending'>;
}

export interface VendorDashboardDto {
  productCount: number;
  orderCountByStatus: Partial<Record<OrderStatus, number>>;
  totalRevenue: number;
  currency: CurrencyCode;
}
