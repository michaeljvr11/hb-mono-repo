import { Injectable, PipeTransform, UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';

/** Locked decision (vault: "Product Image Optimization Pipeline", 2026-08-18). */
const MAX_DIMENSION_PX = 8000;

/**
 * A product image file after `ProductImageDimensionsPipe` has probed it — carries the
 * intrinsic pixel dimensions read from its buffer so downstream code doesn't need to
 * re-probe it. `sizeBytes` reuses Multer's own `file.size` (accurate under memoryStorage
 * too); only width/height require the sharp probe.
 */
export interface ProbedProductImageFile extends Express.Multer.File {
  dimensions: { width: number; height: number };
}

/**
 * Reads intrinsic pixel dimensions of every uploaded product image and rejects the whole
 * request with 422 if any image exceeds 8000x8000 or can't be read as an image at all
 * (corrupt/truncated upload) — a decode failure here is a 422, never an unhandled 500.
 *
 * PIO-2 switched `productImageMulterOptions` to `memoryStorage`, so this pipe now probes
 * `file.buffer` directly instead of opening `file.path` from disk. Nothing is written to
 * disk at this point in the request (the raw original never touches disk — locked
 * decision), so unlike PIO-1 there is no per-file cleanup to do on rejection.
 *
 * This pipe only guards the fixed absurd-input ceiling; the actual resize/re-encode into
 * the thumbnail/card/full derivative set happens later, in
 * `ProductsService.createWithImages` via `ImageProcessorService`.
 */
@Injectable()
export class ProductImageDimensionsPipe implements PipeTransform<
  Express.Multer.File[] | undefined,
  Promise<ProbedProductImageFile[]>
> {
  async transform(files: Express.Multer.File[] = []): Promise<ProbedProductImageFile[]> {
    if (!files.length) {
      return [];
    }

    const probes = await Promise.all(
      files.map(async (file) => {
        try {
          const { width, height } = await sharp(file.buffer).metadata();
          return { file, width, height };
        } catch {
          // Unreadable by sharp despite passing the mimetype/magic-number check
          // (e.g. corrupt or truncated upload) — treat as a rejection, not a 500.
          return { file, width: undefined, height: undefined };
        }
      }),
    );

    const offender = probes.find(
      (p) => !p.width || !p.height || p.width > MAX_DIMENSION_PX || p.height > MAX_DIMENSION_PX,
    );

    if (offender) {
      throw new UnprocessableEntityException(
        offender.width && offender.height
          ? `Image "${offender.file.originalname}" is ${offender.width}x${offender.height}px; ` +
              `maximum allowed is ${MAX_DIMENSION_PX}x${MAX_DIMENSION_PX}px.`
          : `Image "${offender.file.originalname}" could not be read as an image.`,
      );
    }

    return probes.map(
      ({ file, width, height }): ProbedProductImageFile =>
        Object.assign(file, { dimensions: { width: width, height: height } }),
    );
  }
}

export const productImageDimensionsPipe = new ProductImageDimensionsPipe();
