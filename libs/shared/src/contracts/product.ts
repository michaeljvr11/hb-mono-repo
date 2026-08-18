import { CountryCode, CurrencyCode, ListingType } from '../enums';

export interface ProductVendorDto {
  id: string;
  businessName: string;
}

export interface ProductCategoryDto {
  id: string;
  name: string;
  slug?: string;
}

/** One resized/re-encoded derivative of an uploaded product image. Always WebP (locked decision — no JPEG fallback). */
export interface ProductImageVariantDto {
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/** The fixed derivative set produced per uploaded image. Any key may be absent — e.g. a legacy row, or a preset skipped for some other reason. */
export interface ProductImageVariantSet {
  thumbnail?: ProductImageVariantDto;
  card?: ProductImageVariantDto;
  full?: ProductImageVariantDto;
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
  variants?: ProductImageVariantSet;
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
}

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
