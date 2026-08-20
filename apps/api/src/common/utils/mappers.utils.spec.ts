import { CountryCode, CurrencyCode, ListingType } from '@hb/shared';
import { ProductToResponseDto } from './mappers.utils';
import { Product } from '../../products/entities/product.entity';
import { ProductImage } from '../../products/entities/product-image.entity';

const NOW = new Date('2026-08-18T10:00:00.000Z');

const makeImage = (overrides: Partial<ProductImage> = {}): ProductImage =>
  ({
    id: 'img-1',
    url: '/uploads/products/img-1.png',
    isPrimary: true,
    displayOrder: 0,
    altText: 'A product image',
    width: undefined,
    height: undefined,
    sizeBytes: undefined,
    ...overrides,
  }) as ProductImage;

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Test Product',
  description: 'A product description',
  price: 99.99,
  currency: CurrencyCode.ZAR,
  stockQuantity: 10,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.PLATFORM,
  images: [],
  categories: [],
  vendor: undefined,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe('ProductToResponseDto image mapping', () => {
  it('maps width/height/sizeBytes through for a newly-probed image', () => {
    const product = makeProduct({
      images: [makeImage({ width: 1200, height: 800, sizeBytes: 345_678 })],
    });

    const dto = ProductToResponseDto(product);

    expect(dto.images[0]).toMatchObject({
      width: 1200,
      height: 800,
      sizeBytes: 345_678,
    });
  });

  it('regression: a legacy row with null dimensions still serialises and renders', () => {
    const product = makeProduct({
      images: [makeImage({ width: undefined, height: undefined, sizeBytes: undefined })],
    });

    const dto = ProductToResponseDto(product);

    expect(dto.images).toHaveLength(1);
    expect(dto.images[0]).toMatchObject({
      id: 'img-1',
      url: '/uploads/products/img-1.png',
      isPrimary: true,
      displayOrder: 0,
    });
    expect(dto.images[0].width).toBeUndefined();
    expect(dto.images[0].height).toBeUndefined();
    expect(dto.images[0].sizeBytes).toBeUndefined();
  });

  it('handles a product with no images at all', () => {
    const product = makeProduct({ images: [] });
    const dto = ProductToResponseDto(product);
    expect(dto.images).toEqual([]);
  });
});
