import { Injectable, PipeTransform } from '@nestjs/common';
import { probeImageDimensions } from '../../common/image-processing/image-dimension-guard';

/**
 * A vendor logo/banner file after `VendorImageDimensionsPipe` has probed it — carries the
 * intrinsic pixel dimensions read from its buffer so `VendorsService` doesn't need to
 * re-probe it.
 */
export interface ProbedVendorImageFile extends Express.Multer.File {
  dimensions: { width: number; height: number };
}

/**
 * Reads the intrinsic pixel dimensions of a single uploaded vendor logo/banner file and
 * rejects with 422 if it exceeds 8000x8000 or can't be read as an image at all —
 * mirrors `ProductImageDimensionsPipe` (PIO-1) for a single-file route instead of a
 * batch. The probe + 8000x8000 ceiling itself is shared code
 * (`apps/api/src/common/image-processing/image-dimension-guard.ts`) — the vendor path had
 * no dimension probe before PIO-5, but the same decompression-bomb argument applies here
 * as it does for products.
 *
 * Runs on `file.buffer`, which `vendorImageMulterOptions` (memoryStorage, PIO-5) always
 * populates.
 */
@Injectable()
export class VendorImageDimensionsPipe implements PipeTransform<
  Express.Multer.File,
  Promise<ProbedVendorImageFile>
> {
  async transform(file: Express.Multer.File): Promise<ProbedVendorImageFile> {
    const dimensions = await probeImageDimensions(file.buffer, file.originalname);
    return Object.assign(file, { dimensions });
  }
}

export const vendorImageDimensionsPipe = new VendorImageDimensionsPipe();
