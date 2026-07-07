import { CountryCode, CurrencyCode, ListingType, VendorStatus } from '@hb/shared';
import { Product } from '../products/entities/product.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { mapProductToSearchDocument, PLATFORM_VENDOR_STATUS } from './search-document';

const NOW = new Date('2026-06-01T10:00:00.000Z');

const makeVendor = (overrides: Partial<Vendor> = {}): Vendor =>
  ({
    id: 'v1',
    businessName: 'Test Vendor Co',
    status: VendorStatus.APPROVED,
    ...overrides,
  }) as Vendor;

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Vitamin C Serum',
  description: 'Brightening serum',
  price: 249.99,
  currency: CurrencyCode.ZAR,
  stockQuantity: 5,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.PLATFORM,
  images: [],
  categories: [],
  vendor: undefined,
  vendorId: undefined,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('mapProductToSearchDocument', () => {
  it('maps a platform listing with null vendor fields and the platform sentinel', () => {
    const product = makeProduct();

    const doc = mapProductToSearchDocument(product);

    expect(doc.businessName).toBeNull();
    expect(doc.vendorId).toBeNull();
    expect(doc.vendorStatus).toBe(PLATFORM_VENDOR_STATUS);
    expect(doc.listingType).toBe(ListingType.PLATFORM);
  });

  it('maps a vendor listing with the vendor businessName, id, and live status', () => {
    const vendor = makeVendor({ status: VendorStatus.SUSPENDED });
    const product = makeProduct({
      listingType: ListingType.VENDOR,
      vendor,
      vendorId: vendor.id,
    });

    const doc = mapProductToSearchDocument(product);

    expect(doc.businessName).toBe('Test Vendor Co');
    expect(doc.vendorId).toBe('v1');
    expect(doc.vendorStatus).toBe(VendorStatus.SUSPENDED);
  });

  it('derives inStock from stockQuantity (> 0)', () => {
    expect(mapProductToSearchDocument(makeProduct({ stockQuantity: 1 })).inStock).toBe(true);
    expect(mapProductToSearchDocument(makeProduct({ stockQuantity: 0 })).inStock).toBe(false);
  });

  it('maps categories to categoryIds and categoryNames', () => {
    const product = makeProduct({
      categories: [{ id: 'c1', name: 'Skincare' } as never, { id: 'c2', name: 'Serums' } as never],
    });

    const doc = mapProductToSearchDocument(product);

    expect(doc.categoryIds).toEqual(['c1', 'c2']);
    expect(doc.categoryNames).toEqual(['Skincare', 'Serums']);
  });

  it('picks the primary image, falling back to the first image, then null', () => {
    const withPrimary = makeProduct({
      images: [
        { id: 'i1', url: '/img/1.jpg', isPrimary: false } as never,
        { id: 'i2', url: '/img/primary.jpg', isPrimary: true } as never,
      ],
    });
    expect(mapProductToSearchDocument(withPrimary).imageUrl).toBe('/img/primary.jpg');

    const noPrimaryFlag = makeProduct({
      images: [{ id: 'i1', url: '/img/first.jpg', isPrimary: false } as never],
    });
    expect(mapProductToSearchDocument(noPrimaryFlag).imageUrl).toBe('/img/first.jpg');

    const noImages = makeProduct({ images: [] });
    expect(mapProductToSearchDocument(noImages).imageUrl).toBeNull();
  });

  it('carries price and currency together, and converts createdAt to unix seconds', () => {
    const product = makeProduct({ price: 100.5, currency: CurrencyCode.NAD });

    const doc = mapProductToSearchDocument(product);

    expect(doc.price).toBe(100.5);
    expect(doc.currency).toBe(CurrencyCode.NAD);
    expect(doc.createdAt).toBe(Math.floor(NOW.getTime() / 1000));
  });
});
