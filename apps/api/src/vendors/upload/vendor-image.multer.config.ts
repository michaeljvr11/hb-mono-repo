import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Disk-storage options for vendor logo/banner uploads.
 * Mirrors productImageMulterOptions exactly (see apps/api/src/products/upload/multer.config.ts) —
 * only the destination folder differs. Must be passed to FileInterceptor explicitly —
 * without it Multer falls back to memory storage and file.filename is undefined
 * (broken image URLs).
 */
export const vendorImageMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: './uploads/vendors',
    filename: (req, file, cb) => {
      cb(null, `${uuidv4()}${extname(file.originalname)}`);
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
