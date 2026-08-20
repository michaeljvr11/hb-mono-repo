import { ProductImageDto } from '@hb/shared';
import { buildResponsiveImage } from './responsive-image';

describe('buildResponsiveImage', () => {
  it('returns src only, no srcset/width/height, for a legacy row with no variants', () => {
    const image: ProductImageDto = {
      id: 'img1',
      url: 'http://a.com/legacy.jpg',
      isPrimary: true,
      displayOrder: 0,
    };

    const result = buildResponsiveImage(image);

    expect(result).toEqual({
      src: 'http://a.com/legacy.jpg',
      srcset: undefined,
      width: undefined,
      height: undefined,
    });
  });

  it('builds an ascending-width srcset from a full variant set', () => {
    const image: ProductImageDto = {
      id: 'img1',
      url: 'http://a.com/full.webp',
      isPrimary: true,
      displayOrder: 0,
      width: 2000,
      height: 2000,
      sizeBytes: 123,
      variants: {
        thumbnail: { url: 'http://a.com/thumb.webp', width: 300, height: 300, sizeBytes: 10 },
        card: { url: 'http://a.com/card.webp', width: 800, height: 800, sizeBytes: 40 },
        full: { url: 'http://a.com/full.webp', width: 2000, height: 2000, sizeBytes: 123 },
      },
    };

    const result = buildResponsiveImage(image);

    expect(result.src).toBe('http://a.com/full.webp');
    expect(result.srcset).toBe(
      'http://a.com/thumb.webp 300w, http://a.com/card.webp 800w, http://a.com/full.webp 2000w',
    );
    expect(result.width).toBe(2000);
    expect(result.height).toBe(2000);
  });

  it('omits a skipped preset (e.g. a small upload with no card derivative)', () => {
    const image: ProductImageDto = {
      id: 'img1',
      url: 'http://a.com/full.webp',
      isPrimary: true,
      displayOrder: 0,
      width: 400,
      height: 400,
      sizeBytes: 50,
      variants: {
        thumbnail: { url: 'http://a.com/thumb.webp', width: 300, height: 300, sizeBytes: 8 },
        full: { url: 'http://a.com/full.webp', width: 400, height: 400, sizeBytes: 50 },
        // no `card` — deliberately skipped by PIO-2 as a duplicate of `full`
      },
    };

    const result = buildResponsiveImage(image);

    expect(result.srcset).toBe('http://a.com/thumb.webp 300w, http://a.com/full.webp 400w');
  });

  // ─── PIO-5: vendor branding (logo/banner) adapted to the same source shape ──
  //
  // `VendorDto` carries the canonical URL on `logoUrl`/`bannerUrl` and the
  // rest of the metadata nested under `logo`/`banner` (an `UploadedImageDto`),
  // so callers adapt with a spread — `{ url: vendor.logoUrl, ...vendor.logo }`
  // — rather than the helper special-casing vendors.

  it('adapts a vendor logo (thumbnail + full, no card — the logo preset) into an ascending srcset', () => {
    const logo = {
      width: 512,
      height: 512,
      sizeBytes: 9000,
      variants: {
        thumbnail: { url: 'http://a.com/logo-thumb.webp', width: 144, height: 144, sizeBytes: 4000 },
        full: { url: 'http://a.com/logo-full.webp', width: 512, height: 512, sizeBytes: 9000 },
        // no `card` — the logo preset never generates one.
      },
    };

    const result = buildResponsiveImage({ url: 'http://a.com/logo-full.webp', ...logo });

    expect(result.src).toBe('http://a.com/logo-full.webp');
    expect(result.srcset).toBe('http://a.com/logo-thumb.webp 144w, http://a.com/logo-full.webp 512w');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('adapts a vendor banner (card + full, no thumbnail — the banner preset) into an ascending srcset', () => {
    const banner = {
      width: 1280,
      height: 549,
      sizeBytes: 42000,
      variants: {
        card: { url: 'http://a.com/banner-card.webp', width: 640, height: 274, sizeBytes: 15000 },
        full: { url: 'http://a.com/banner-full.webp', width: 1280, height: 549, sizeBytes: 42000 },
        // no `thumbnail` — the banner preset never generates one.
      },
    };

    const result = buildResponsiveImage({ url: 'http://a.com/banner-full.webp', ...banner });

    expect(result.srcset).toBe('http://a.com/banner-card.webp 640w, http://a.com/banner-full.webp 1280w');
  });

  it('falls back to a plain src for a legacy vendor with only logoUrl/bannerUrl set (no `logo`/`banner`)', () => {
    // Mirrors what the component passes when `vendor.logo` is absent: no `variants`
    // key at all in the adapted object, same as the pre-PIO-2 product-row case above.
    const result = buildResponsiveImage({ url: 'http://a.com/legacy-logo.png' });

    expect(result).toEqual({
      src: 'http://a.com/legacy-logo.png',
      srcset: undefined,
      width: undefined,
      height: undefined,
    });
  });
});
