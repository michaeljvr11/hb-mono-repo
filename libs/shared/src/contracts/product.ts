import { CountryCode, CurrencyCode, ListingType } from '../enums';
import { ImageVariantSet } from './image';
import { ProductShippingFeeOverrideDto } from './shipping-fee';

export interface ProductVendorDto {
  id: string;
  businessName: string;
}

export interface ProductCategoryDto {
  id: string;
  name: string;
  slug?: string;
}

export interface ProductImageDto {
  id: string;
  url: string;
  isPrimary: boolean;
  displayOrder: number;
  altText?: string;
  /** Intrinsic dimensions of `url` (the `full` derivative once processed). Absent on legacy rows (no backfill). */
  width?: number;
  height?: number;
  /** Byte size of `url`. Absent on legacy rows (no backfill). */
  sizeBytes?: number;
  /** Responsive derivatives generated at upload time. Absent ⇒ render `url` alone (legacy row, pre-PIO-2). */
  variants?: ImageVariantSet;
}

/** Per-product, opt-in size row with its own stock count (Product Sizing). */
export interface ProductSizeDto {
  id: string;
  label: string;
  stockQuantity: number;
  displayOrder: number;
}

/** Body shape for creating/replacing one size when submitting `sizes` on create/update. */
export interface ProductSizeInput {
  label: string;
  stockQuantity: number;
  displayOrder?: number;
}

export interface ProductDto {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: CurrencyCode;
  stockQuantity: number;
  /** Where the product ships from. Drives the cross-border fulfilment path. */
  originCountry: CountryCode;
  /** platform = first-party (HB-fulfilled), vendor = marketplace listing. */
  listingType: ListingType;
  images: ProductImageDto[];
  /** Absent on platform (first-party) listings. */
  vendor?: ProductVendorDto;
  categories: ProductCategoryDto[];
  createdAt: string;
  updatedAt: string;
  /** Admin-configured per-route/currency shipping fee overrides for this product (SF-5). Absent/omitted where not populated by the endpoint — see ProductShippingFeeOverrideService for the source of truth. */
  shippingFeeOverrides?: ProductShippingFeeOverrideDto[];
  /** Opt-in per-size stock list (Product Sizing), ordered by displayOrder. Absent/omitted for unsized products — zero sizes ⇒ unchanged legacy single-stock behaviour. */
  sizes?: ProductSizeDto[];
}

export interface ProductCreateRequest {
  name: string;
  description: string;
  price: number;
  currency?: CurrencyCode;
  stockQuantity?: number;
  originCountry?: CountryCode;
  vendorId?: string;
  categoryIds?: string[];
  /** Opt-in per-size stock list. Omitted/empty ⇒ product stays unsized. */
  sizes?: ProductSizeInput[];
}

/**
 * `sizes` uses whole-list-replace semantics on update, matching `categoryIds`:
 * present (even `[]`) replaces the full set; absent leaves existing sizes untouched.
 */
export type ProductUpdateRequest = Partial<ProductCreateRequest>;

/** Sort order for GET /products. Defaults to 'newest' when omitted. */
export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'name';

/** Discovery query params for GET /products — all optional, all AND-composed. */
export interface ProductQuery {
  categoryId?: string;
  q?: string;
  /** Vendor drill-down (e.g. a vendor's public storefront page). */
  vendorId?: string;
  /** 1-based page number. Defaults to 1. */
  page?: number;
  /** Page size. Defaults to 24 server-side; clamped to a server-side max, never rejected. */
  limit?: number;
  /** Defaults to 'newest' when omitted. */
  sort?: ProductSort;
}
