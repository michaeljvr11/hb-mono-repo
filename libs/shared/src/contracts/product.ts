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

export interface ProductImageDto {
  id: string;
  url: string;
  isPrimary: boolean;
  displayOrder: number;
  altText?: string;
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

/** Discovery query params for GET /products — all optional, all AND-composed. */
export interface ProductQuery {
  categoryId?: string;
  q?: string;
  /** Vendor drill-down (e.g. a vendor's public storefront page). */
  vendorId?: string;
}
