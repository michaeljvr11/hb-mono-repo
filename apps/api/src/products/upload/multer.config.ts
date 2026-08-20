import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

/**
 * Memory-storage options for product image uploads (locked decision, "Product Image
 * Optimization Pipeline" spec, 2026-08-18): the raw original never touches disk. Every
 * accepted upload is resized/re-encoded into WebP derivatives before anything is written to
 * `uploads/products` — see `ProductsService.createWithImages` and
 * `apps/api/src/common/image-processing/`. The stored filename/extension is always
 * `<uuid>-<preset>.webp`, derived from the processor's fixed output format — never from
 * `file.mimetype` or the client-supplied `originalname`.
 *
 * `fileFilter` here is a cheap first-pass check against the client-supplied `mimetype` only
 * (defense in depth / fast-fail before buffering); it does not replace real validation.
 * `productImageFilePipe` runs the actual magic-number check against `file.buffer`, which
 * memoryStorage populates (unlike the diskStorage this replaced).
 *
 * Must be passed to FilesInterceptor explicitly — the Multer default is disk storage.
 */
export const productImageMulterOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
      return cb(new BadRequestException('Only image files are allowed!'), false);
    }
    cb(null, true);
  },
};
