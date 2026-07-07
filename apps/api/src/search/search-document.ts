import { CountryCode, CurrencyCode, ListingType, VendorStatus } from '@hb/shared';
import { Product } from '../products/entities/product.entity';

/**
 * Sentinel vendorStatus for platform (first-party) listings, which have no
 * vendor row. Lets the single query-time visibility filter stay uniform:
 * `vendorStatus = approved OR listingType = platform`.
 */
export const PLATFORM_VENDOR_STATUS = 'platform';

/**
 * The v1 Meilisearch product document. Derived from Postgres (the source of
 * truth) — the index is disposable and always rebuildable via full reindex.
 */
export interface ProductSearchDocument {
  id: string;
  name: string;
  description: string;
  /** Null on platform listings (mirrors ProductDto.vendor?). */
  businessName: string | null;
  vendorId: string | null;
  /** Vendor.status, or the 'platform' sentinel for first-party listings. */
  vendorStatus: VendorStatus | typeof PLATFORM_VENDOR_STATUS;
  listingType: ListingType;
  price: number;
  currency: CurrencyCode;
  categoryIds: string[];
  categoryNames: string[];
  inStock: boolean;
  stockQuantity: number;
  originCountry: CountryCode;
  /** Unix epoch seconds — Meilisearch ranking rules need a numeric field. */
  createdAt: number;
  imageUrl: string | null;
}

/**
 * Pure mapping from a fully-loaded Product entity (vendor, categories, images
 * relations populated) to the search document. Reused by the event listeners
 * and the scheduled full reindex — one mapping, no drift.
 */
export function mapProductToSearchDocument(product: Product): ProductSearchDocument {
  const primaryImage = product.images?.find((img) => img.isPrimary) ?? product.images?.[0] ?? null;

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    businessName: product.vendor?.businessName ?? null,
    vendorId: product.vendorId ?? null,
    vendorStatus:
      product.listingType === ListingType.PLATFORM
        ? PLATFORM_VENDOR_STATUS
        : (product.vendor?.status ?? VendorStatus.PENDING),
    listingType: product.listingType,
    price: Number(product.price),
    currency: product.currency,
    categoryIds: product.categories?.map((c) => c.id) ?? [],
    categoryNames: product.categories?.map((c) => c.name) ?? [],
    inStock: product.stockQuantity > 0,
    stockQuantity: product.stockQuantity,
    originCountry: product.originCountry,
    createdAt: Math.floor(new Date(product.createdAt).getTime() / 1000),
    imageUrl: primaryImage?.url ?? null,
  };
}
