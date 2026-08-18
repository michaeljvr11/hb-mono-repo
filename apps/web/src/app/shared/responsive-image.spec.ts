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
});
