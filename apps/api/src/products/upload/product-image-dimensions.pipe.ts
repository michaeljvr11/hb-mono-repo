import { Injectable, PipeTransform, UnprocessableEntityException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import sharp from 'sharp';

/** Locked decision (vault: "Product Image Optimization Pipeline", 2026-08-18). */
const MAX_DIMENSION_PX = 8000;

/**
 * A product image file after `ProductImageDimensionsPipe` has probed it — carries the
 * intrinsic pixel dimensions read from disk so `ProductsService` doesn't need to re-open
 * the file. `sizeBytes` reuses Multer's own `file.size` (already accurate for disk-stored
 * files); only width/height require the sharp probe.
 */
export interface ProbedProductImageFile extends Express.Multer.File {
  dimensions: { width: number; height: number };
}

/**
 * Reads intrinsic pixel dimensions of every uploaded product image (metadata probe only —
 * PIO-1; resizing/derivatives land in PIO-2) and rejects the whole request with 422 if any
 * image exceeds 8000x8000.
 *
 * Runs after `productImageFilePipe` in the `@UploadedFiles()` chain, so by this point Multer
 * has already written every file in the request to disk (productImageMulterOptions is disk
 * storage). On rejection, every file of the request is unlinked — not just the offending
 * one — so a rejected multi-file upload never leaves orphaned files under uploads/products.
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
          const { width, height } = await sharp(file.path).metadata();
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
      await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));

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
