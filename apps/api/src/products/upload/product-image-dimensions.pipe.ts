import { Injectable, PipeTransform } from '@nestjs/common';
import { probeImageDimensions } from '../../common/image-processing/image-dimension-guard';

/**
 * Rejects the whole request with 422 if any uploaded product image exceeds 8000x8000px or
 * can't be read as an image at all (corrupt/truncated upload) — a decode failure here is a
 * 422, never an unhandled 500. The probe + ceiling itself lives in `probeImageDimensions`
 * (`apps/api/src/common/image-processing/image-dimension-guard.ts`), shared with the
 * vendor logo/banner path (PIO-5) so the guard exists once, not once per upload path.
 *
 * A pure guard — it does not attach the probed dimensions to the file. `ProductsService`
 * takes each image's dimensions from `ImageProcessorService`'s post-rotation output
 * instead, which is the correct source: an EXIF-rotated photo's post-rotation dimensions
 * differ from its pre-rotation ones, and nothing downstream ever reads a pre-rotation
 * probe.
 *
 * PIO-2 switched `productImageMulterOptions` to `memoryStorage`, so this pipe probes
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
  Promise<Express.Multer.File[]>
> {
  async transform(files: Express.Multer.File[] = []): Promise<Express.Multer.File[]> {
    if (!files.length) {
      return [];
    }

    const errors = await Promise.all(
      files.map(async (file): Promise<unknown> => {
        try {
          await probeImageDimensions(file.buffer, file.originalname);
          return undefined;
        } catch (error) {
          return error;
        }
      }),
    );

    // Deterministic by upload order, not by which probe's promise settles first.
    const offender = errors.find((error) => error !== undefined);
    if (offender) {
      throw offender;
    }

    return files;
  }
}

export const productImageDimensionsPipe = new ProductImageDimensionsPipe();
