import { BadRequestException } from '@nestjs/common';
import { vendorImageMulterOptions } from './vendor-image.multer.config';

// PIO-5 switched this path from diskStorage to memoryStorage (locked decision, "Product
// Image Optimization Pipeline" spec, PIO-4 design output, 2026-08-18) — the raw original
// is never written to disk; `VendorsService` writes only the processed WebP derivatives,
// named `<uuid>-<preset>.webp`, never from `file.mimetype` or `originalname`. Mirrors
// `apps/api/src/products/upload/multer.config.spec.ts`.
describe('vendorImageMulterOptions.storage', () => {
  it('uses memoryStorage — the raw upload never touches disk', () => {
    const storage = vendorImageMulterOptions.storage as { getFilename?: unknown };
    // diskStorage exposes a getFilename hook that memoryStorage does not.
    expect(storage.getFilename).toBeUndefined();
  });
});

describe('vendorImageMulterOptions.fileFilter', () => {
  const runFilter = (mimetype: string) =>
    new Promise<{ error: Error | null; accepted: boolean }>((resolve) => {
      const file = { mimetype } as Express.Multer.File;
      vendorImageMulterOptions.fileFilter({}, file, (error: Error | null, accepted: boolean) =>
        resolve({ error, accepted }),
      );
    });

  it.each(['image/jpg', 'image/jpeg', 'image/png', 'image/webp'])(
    'accepts %s',
    async (mimetype) => {
      const { error, accepted } = await runFilter(mimetype);
      expect(error).toBeNull();
      expect(accepted).toBe(true);
    },
  );

  it.each(['application/pdf', 'text/plain', 'image/gif', 'application/octet-stream'])(
    'rejects a non-image file (%s) with a BadRequestException and does not accept it',
    async (mimetype) => {
      const { error, accepted } = await runFilter(mimetype);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(accepted).toBe(false);
    },
  );
});
