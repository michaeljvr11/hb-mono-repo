import { BadRequestException } from '@nestjs/common';
import { productImageMulterOptions } from './multer.config';

// PIO-2 switched this path from diskStorage to memoryStorage (locked decision, "Product
// Image Optimization Pipeline" spec, 2026-08-18) — the raw original is never written to
// disk; `ProductsService` writes only the processed WebP derivatives, named
// `<uuid>-<preset>.webp`, never from `file.mimetype` or `originalname`. See
// `image-variant-writer.service.spec.ts` for the regression coverage on *that* naming
// (the extension-injection lesson this multer config used to be responsible for).
describe('productImageMulterOptions.storage', () => {
  it('uses memoryStorage — the raw upload never touches disk', () => {
    const storage = productImageMulterOptions.storage as { getFilename?: unknown };
    // diskStorage exposes a getFilename hook that memoryStorage does not.
    expect(storage.getFilename).toBeUndefined();
  });
});

describe('productImageMulterOptions.fileFilter', () => {
  const runFilter = (mimetype: string) =>
    new Promise<{ error: Error | null; accepted: boolean }>((resolve) => {
      const file = { mimetype } as Express.Multer.File;
      productImageMulterOptions.fileFilter({}, file, (error: Error | null, accepted: boolean) =>
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
