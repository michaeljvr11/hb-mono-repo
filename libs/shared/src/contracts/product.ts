import { CountryCode, CurrencyCode, ListingType } from '../enums';
import { ImageVariantSet } from './image';

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
