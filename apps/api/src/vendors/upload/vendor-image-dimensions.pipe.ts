import { Injectable, PipeTransform } from '@nestjs/common';
import { probeImageDimensions } from '../../common/image-processing/image-dimension-guard';

/**
 * Rejects a single uploaded vendor logo/banner file with 422 if it exceeds 8000x8000px or
 * can't be read as an image at all — mirrors `ProductImageDimensionsPipe` (PIO-1) for a
 * single-file route instead of a batch. The probe + 8000x8000 ceiling itself is shared
 * code (`apps/api/src/common/image-processing/image-dimension-guard.ts`) — the vendor path
 * had no dimension probe before PIO-5, but the same decompression-bomb argument applies
 * here as it does for products.
 *
 * A pure guard — it does not attach the probed dimensions to the file. `VendorsService`
 * takes the asset's dimensions from `ImageProcessorService`'s post-rotation output
 * instead, which is the correct source: an EXIF-rotated photo's post-rotation dimensions
 * differ from its pre-rotation ones, and nothing downstream ever reads a pre-rotation
 * probe.
 *
 * Runs on `file.buffer`, which `vendorImageMulterOptions` (memoryStorage, PIO-5) always
 * populates.
 */
@Injectable()
export class VendorImageDimensionsPipe implements PipeTransform<
  Express.Multer.File,
  Promise<Express.Multer.File>
> {
  async transform(file: Express.Multer.File): Promise<Express.Multer.File> {
    await probeImageDimensions(file.buffer, file.originalname);
    return file;
  }
}

export const vendorImageDimensionsPipe = new VendorImageDimensionsPipe();
