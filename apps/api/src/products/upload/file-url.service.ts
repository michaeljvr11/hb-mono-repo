import { Injectable } from '@nestjs/common';

/**
 * Maps stored file keys to public URLs.
 * Local disk for now; replace with CDN/object-storage URLs later without
 * touching callers.
 */
@Injectable()
export class FileUrlService {
  getFileUrl(filename: string, folder = 'products'): string {
    return `/uploads/${folder}/${filename}`;
  }
}
