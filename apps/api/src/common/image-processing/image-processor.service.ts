import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { ImagePreset, ProcessedImageVariant } from './image-processor.types';

/** Encode-quality ladder tried, high to low, only when a preset sets a `targetBytes` budget. */
const QUALITY_STEPS = [82, 68, 55, 42, 30];

/**
 * Resizes and re-encodes a source image buffer into a caller-supplied set of WebP
 * derivatives. Not product- or vendor-specific — the preset set is a parameter, never
 * hardcoded here (see `products/upload/product-image.presets.ts` for the product set;
 * PIO-5 reuses this service unmodified with its own logo/banner presets).
 *
 * Locked decisions (vault: "Product Image Optimization Pipeline", 2026-08-18):
 * - Output is WebP only — no JPEG fallback, one encode per derivative.
 * - Aspect ratio preserved, never cropped, never upscaled beyond intrinsic size
 *   (`fit: 'inside', withoutEnlargement: true`).
 * - EXIF auto-oriented first (`.rotate()` with no args reads the orientation tag, rotates
 *   the pixels, then discards the tag), then all metadata is stripped — sharp's default
 *   output behaviour, since `.withMetadata()`/`.withExif()` is never called here.
 * - A corrupt/truncated/non-image buffer is rejected with `UnprocessableEntityException`
 *   (422), never allowed to surface as an unhandled 500.
 */
@Injectable()
export class ImageProcessorService {
  async process(input: Buffer, presets: ImagePreset[]): Promise<ProcessedImageVariant[]> {
    const longestEdge = await this.assertReadable(input);

    // Because nothing is ever upscaled, two presets whose caps both exceed the source's
    // longest edge would render byte-identical derivatives. Emit the first of those only —
    // a 400px upload yields a 400px `full` and a 300px `thumbnail`, not a redundant third
    // 400px `card`. Consumers already treat every entry of the variant set as optional.
    const emitted = new Set<number>();
    const variants: ProcessedImageVariant[] = [];

    for (const preset of presets) {
      const effective = Math.min(preset.maxDimension, longestEdge);
      if (emitted.has(effective)) {
        continue;
      }
      emitted.add(effective);
      variants.push(await this.renderPreset(input, preset));
    }

    return variants;
  }

  /**
   * Fails fast with a 422 (not a 500) for a buffer sharp cannot decode as an image at all.
   * Returns the source's longest intrinsic edge, which bounds every derivative (nothing is
   * ever upscaled).
   */
  private async assertReadable(input: Buffer): Promise<number> {
    try {
      const { width, height } = await sharp(input).metadata();
      if (!width || !height) {
        throw new Error('no intrinsic dimensions');
      }
      return Math.max(width, height);
    } catch {
      throw new UnprocessableEntityException('Uploaded file could not be read as an image.');
    }
  }

  private async renderPreset(input: Buffer, preset: ImagePreset): Promise<ProcessedImageVariant> {
    let last: { data: Buffer; info: sharp.OutputInfo } | undefined;

    try {
      for (const quality of QUALITY_STEPS) {
        last = await sharp(input)
          .rotate() // auto-orient from EXIF, then the orientation tag is discarded
          .resize(preset.maxDimension, preset.maxDimension, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality })
          .toBuffer({ resolveWithObject: true });

        if (!preset.targetBytes || last.data.length <= preset.targetBytes) {
          break;
        }
      }
    } catch (err) {
      if (err instanceof UnprocessableEntityException) throw err;
      throw new UnprocessableEntityException(
        `Uploaded file could not be processed for the "${preset.name}" derivative.`,
      );
    }

    // QUALITY_STEPS is non-empty, so the loop above always runs at least once.
    const rendered = last;
    return {
      preset: preset.name,
      buffer: rendered.data,
      width: rendered.info.width,
      height: rendered.info.height,
      sizeBytes: rendered.data.length,
      format: 'webp',
    };
  }
}
