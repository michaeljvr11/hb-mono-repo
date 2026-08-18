import { Injectable, PipeTransform } from '@nestjs/common';
import {
  probeImageDimensions,
  ProbedDimensions,
} from '../../common/image-processing/image-dimension-guard';

/**
 * A product image file after `ProductImageDimensionsPipe` has probed it — carries the
 * intrinsic pixel dimensions read from its buffer so downstream code doesn't need to
 * re-probe it. `sizeBytes` reuses Multer's own `file.size` (accurate under memoryStorage
 * too); only width/height require the sharp probe.
 */
export interface ProbedProductImageFile extends Express.Multer.File {
  dimensions: { width: number; height: number };
}

type Probe =
  | { file: Express.Multer.File; dimensions: ProbedDimensions; error?: undefined }
  | { file: Express.Multer.File; dimensions?: undefined; error: unknown };

/**
 * Reads intrinsic pixel dimensions of every uploaded product image and rejects the whole
 * request with 422 if any image exceeds 8000x8000 or can't be read as an image at all
 * (corrupt/truncated upload) — a decode failure here is a 422, never an unhandled 500.
 * The probe + ceiling itself lives in `probeImageDimensions`
 * (`apps/api/src/common/image-processing/image-dimension-guard.ts`), shared with the
 * vendor logo/banner path (PIO-5) so the guard exists once, not once per upload path.
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

    const probes: Probe[] = await Promise.all(
      files.map(async (file): Promise<Probe> => {
        try {
          return { file, dimensions: await probeImageDimensions(file.buffer, file.originalname) };
        } catch (error) {
          return { file, error };
        }
      }),
    );

    // Deterministic by upload order, not by which probe's promise settles first.
    const offender = probes.find((p) => p.error !== undefined);
    if (offender) {
      throw offender.error;
    }

    return probes.map(
      ({ file, dimensions }): ProbedProductImageFile =>
        Object.assign(file, { dimensions: dimensions }),
    );
  }
}

export const productImageDimensionsPipe = new ProductImageDimensionsPipe();
