import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';

// Extension is derived from a fixed mimetype allow-list, never from the client-supplied
// `originalname` — `uploads/` is served statically (main.ts), so trusting an attacker-
// controlled originalname extension (e.g. `x.html` sent with an allowed image mimetype)
// would let a stored file be served back as text/html from the API origin.
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpg': '.jpg',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Disk-storage options for product image uploads.
 * Must be passed to FilesInterceptor explicitly — without it Multer falls back
 * to memory storage and file.filename is undefined (broken image URLs).
 */
export const productImageMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: './uploads/products',
    filename: (req, file, cb) => {
      const ext = MIME_EXTENSIONS[file.mimetype];
      if (!ext) {
        return cb(new BadRequestException('Only image files are allowed!'), '');
      }
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
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
