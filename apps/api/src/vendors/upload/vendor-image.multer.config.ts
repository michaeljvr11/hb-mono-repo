import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

/**
 * Memory-storage options for vendor logo/banner uploads (PIO-5, following the products
 * path's PIO-2 precedent — vault: "Product Image Optimization Pipeline", "PIO-4 design
 * output — 2026-08-18"). The raw original never touches disk: every accepted upload is
 * resized/re-encoded into WebP derivatives (`ImageProcessorService` + the logo/banner
 * preset sets in `vendor-image.presets.ts`) before `VendorsService` writes anything to
 * `uploads/vendors`. The stored filename is always `<uuid>-<preset>.webp`, derived from
 * the processor's fixed output format — never from `file.mimetype` or the client-supplied
 * `originalname`. There is no `MIME_EXTENSIONS` map here anymore; output format is always
 * WebP now, same as products.
 *
 * `fileFilter` here is a cheap first-pass check against the client-supplied `mimetype`
 * only (defense in depth / fast-fail before buffering); it does not replace real
 * validation. `vendorImageFilePipe` runs the actual magic-number check against
 * `file.buffer`, which memoryStorage populates.
 *
 * Must be passed to `FileInterceptor` explicitly — the Multer default is disk storage.
 */
export const vendorImageMulterOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB — unchanged (locked decision, OQ5: "5MB stays")
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
      return cb(new BadRequestException('Only image files are allowed!'), false);
    }
    cb(null, true);
  },
};
