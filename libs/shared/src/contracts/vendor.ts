import { CountryCode, CurrencyCode, OrderStatus, VendorSectionType, VendorStatus } from '../enums';
import { UploadedImageDto } from './image';

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
  /** Canonical URL of the `full` logo derivative — unchanged shape, always present when set. */
  logoUrl?: string;
  /** Dimensions/size/derivative set for `logoUrl`, once processed through the image
   * pipeline (PIO-5). Absent for legacy vendors with only `logoUrl` set. */
  logo?: UploadedImageDto;
  /** Canonical URL of the `full` banner derivative — unchanged shape, always present when set. */
  bannerUrl?: string;
  /** Dimensions/size/derivative set for `bannerUrl`, once processed through the image
   * pipeline (PIO-5). Absent for legacy vendors with only `bannerUrl` set. */
  banner?: UploadedImageDto;
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
  // Vendor-portal override for TE-4's notification recipient. null (or an
  // omitted value) means "use the account email" — see VendorsService
  // resolveNotificationEmail(). Never present on the public VendorDto shape.
  notificationEmail?: string | null;
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
  // Set to a valid email to override the notification recipient; set to null
  // or '' to clear the override and fall back to the account email.
  notificationEmail?: string | null;
}

export interface UpdateVendorStatusRequest {
  status: Exclude<VendorStatus, 'pending'>;
}

export interface VendorDashboardDto {
  productCount: number;
  orderCountByStatus: Partial<Record<OrderStatus, number>>;
  /**
   * GROSS line GMV of this vendor's order lines (all statuses, all time) —
   * NOT net-of-commission revenue. Vendors keep the commission-adjusted net;
   * H&B earns only the commission portion. For the accounting-accurate
   * eligible-lines figures (net earnings, accrued balance, settlement
   * preview), see `VendorEarningsReportDto` (GET /vendors/me/earnings).
   */
  totalRevenue: number;
  currency: CurrencyCode;
}
