import { UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { ImageProcessorService } from './image-processor.service';
import { ImagePreset } from './image-processor.types';

/** A flat-colour PNG — cheap to encode, deterministic dimensions. */
async function makeSolidImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
}

/** Noisy content compresses poorly at high WebP quality — used to force the quality ladder to step down. */
async function makeNoisyImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
      noise: { type: 'gaussian', mean: 128, sigma: 60 },
    },
  })
    .png()
    .toBuffer();
}

async function makeImageWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 200, channels: 3, background: 'red' } })
    .withExif({ IFD0: { Copyright: 'HB Test Fixture' } })
    .jpeg()
    .toBuffer();
}

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;

  beforeEach(() => {
    service = new ImageProcessorService();
  });

  it('produces one derivative per preset, all WebP', async () => {
    const input = await makeSolidImage(1000, 600);
    const presets: ImagePreset[] = [
      { name: 'thumbnail', maxDimension: 300 },
      { name: 'card', maxDimension: 800 },
      { name: 'full', maxDimension: 2000 },
    ];

    const variants = await service.process(input, presets);

    expect(variants).toHaveLength(3);
    expect(variants.map((v) => v.preset)).toEqual(['thumbnail', 'card', 'full']);
    for (const variant of variants) {
      expect(variant.format).toBe('webp');
      expect(variant.sizeBytes).toBe(variant.buffer.length);
      expect(variant.sizeBytes).toBeGreaterThan(0);
      const decoded = await sharp(variant.buffer).metadata();
      expect(decoded.format).toBe('webp');
      expect(decoded.width).toBe(variant.width);
      expect(decoded.height).toBe(variant.height);
    }
  });

  it('caps the longest edge at the preset maxDimension, preserving aspect ratio (2:1 source)', async () => {
    const input = await makeSolidImage(1000, 500); // 2:1
    const [variant] = await service.process(input, [{ name: 'card', maxDimension: 400 }]);

    expect(variant.width).toBe(400);
    expect(variant.height).toBe(200); // 2:1 preserved, not stretched/cropped
  });

  it('never upscales beyond the intrinsic size', async () => {
    const input = await makeSolidImage(50, 50);
    const [variant] = await service.process(input, [{ name: 'card', maxDimension: 800 }]);

    expect(variant.width).toBe(50);
    expect(variant.height).toBe(50);
  });

  it('does not upscale an already-small image even for the largest ("full") preset', async () => {
    const input = await makeSolidImage(120, 90);
    const [variant] = await service.process(input, [{ name: 'full', maxDimension: 2000 }]);

    expect(variant.width).toBe(120);
    expect(variant.height).toBe(90);
  });

  it('skips presets that would duplicate an already-emitted derivative on a small source', async () => {
    // 400px source: `full` and `card` both cap above it, so they would render byte-identical
    // output. Only the first (`full`) is emitted; `thumbnail` is genuinely smaller and stays.
    const input = await makeSolidImage(400, 300);
    const variants = await service.process(input, [
      { name: 'full', maxDimension: 2000 },
      { name: 'card', maxDimension: 800 },
      { name: 'thumbnail', maxDimension: 300 },
    ]);

    expect(variants.map((v) => v.preset)).toEqual(['full', 'thumbnail']);
    expect(variants[0].width).toBe(400);
    expect(variants[1].width).toBe(300);
  });

  it('emits every preset when the source is large enough for each to differ', async () => {
    const input = await makeSolidImage(3000, 2000);
    const variants = await service.process(input, [
      { name: 'full', maxDimension: 2000 },
      { name: 'card', maxDimension: 800 },
      { name: 'thumbnail', maxDimension: 300 },
    ]);

    expect(variants.map((v) => v.preset)).toEqual(['full', 'card', 'thumbnail']);
    expect(variants.map((v) => v.width)).toEqual([2000, 800, 300]);
  });

  it('strips embedded EXIF metadata from the output', async () => {
    const input = await makeImageWithExif();
    // Sanity: the fixture really does carry EXIF before it goes through the processor.
    const sourceMeta = await sharp(input).metadata();
    expect(sourceMeta.exif).toBeDefined();

    const [variant] = await service.process(input, [{ name: 'full', maxDimension: 400 }]);
    const outputMeta = await sharp(variant.buffer).metadata();

    expect(outputMeta.exif).toBeUndefined();
  });

  it('auto-orients before resizing (calls sharp.rotate() with no arguments)', async () => {
    const rotateSpy = jest.spyOn(sharp.prototype, 'rotate');
    const input = await makeSolidImage(400, 300);

    await service.process(input, [{ name: 'full', maxDimension: 200 }]);

    expect(rotateSpy).toHaveBeenCalled();
    expect(rotateSpy.mock.calls[0]).toEqual([]);
    rotateSpy.mockRestore();
  });

  it('steps encode quality down to try to land under a targetBytes budget (best-effort)', async () => {
    const input = await makeNoisyImage(600, 600);
    const generous = await service.process(input, [
      { name: 'full', maxDimension: 600, targetBytes: 5 * 1024 * 1024 },
    ]);
    const tight = await service.process(input, [
      { name: 'full', maxDimension: 600, targetBytes: 8 * 1024 },
    ]);

    // Stepping quality down for the tighter budget must shrink the output relative to
    // the high-quality pass — proves the ladder actually engages, not just a no-op.
    expect(tight[0].sizeBytes).toBeLessThan(generous[0].sizeBytes);
  });

  it('does not fail the request when a targetBytes budget cannot be met — returns the smallest it achieved', async () => {
    const input = await makeNoisyImage(600, 600);

    const [variant] = await service.process(input, [
      { name: 'full', maxDimension: 600, targetBytes: 1 }, // impossible budget
    ]);

    expect(variant.sizeBytes).toBeGreaterThan(0);
  });

  it('rejects a corrupt/truncated buffer with 422, not an unhandled 500', async () => {
    const corrupt = Buffer.from('this is not an image');

    await expect(
      service.process(corrupt, [{ name: 'full', maxDimension: 400 }]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects an empty buffer with 422', async () => {
    await expect(
      service.process(Buffer.alloc(0), [{ name: 'full', maxDimension: 400 }]),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('is not product-specific: works with an arbitrary caller-supplied preset set/names', async () => {
    const input = await makeSolidImage(1000, 1000);
    const vendorLikePresets: ImagePreset[] = [
      { name: 'logo', maxDimension: 512 },
      { name: 'banner', maxDimension: 1536 },
    ];

    const variants = await service.process(input, vendorLikePresets);

    expect(variants.map((v) => v.preset)).toEqual(['logo', 'banner']);
  });
});
