import { Injectable } from '@nestjs/common';
import { join } from 'path';

/**
 * Maps stored file keys to public URLs, and public folders to their on-disk location.
 * Local disk for now; replace with CDN/object-storage URLs later without touching callers.
 */
@Injectable()
export class FileUrlService {
  getFileUrl(filename: string, folder = 'products'): string {
    return `/uploads/${folder}/${filename}`;
  }

  /** The on-disk directory backing `getFileUrl(..., folder)` — where derivatives get written. */
  getUploadDir(folder = 'products'): string {
    return join(process.cwd(), 'uploads', folder);
  }
}
