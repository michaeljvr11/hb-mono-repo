import { UnprocessableEntityException } from '@nestjs/common';
import { productImageFilePipe } from './product-image-file.pipe';

// Regression coverage mirroring vendor-image-file.pipe.spec.ts: FileTypeValidator's default
// magic-number check reads file.buffer, which disk storage never populates. Without
// `fallbackToMimetype: true` every disk-stored product image upload was rejected with a
// false 422 — after Multer had already written the file to disk on every request.
describe('productImageFilePipe', () => {
  const diskStorageFile = (overrides: Partial<Express.Multer.File> = {}) =>
    ({
      fieldname: 'images',
      originalname: 'photo.png',
      mimetype: 'image/png',
      filename: 'uuid-generated.png',
      size: 1024,
      // disk storage: no buffer
      ...overrides,
    }) as Express.Multer.File;

  it('accepts disk-storage files (no buffer) via the mimetype fallback', async () => {
    const files = [diskStorageFile()];
    await expect(productImageFilePipe.transform(files)).resolves.toBe(files);
  });

  it('accepts an empty/undefined file list (product images are optional)', async () => {
    await expect(productImageFilePipe.transform(undefined)).resolves.toBeUndefined();
    await expect(productImageFilePipe.transform([])).resolves.toEqual([]);
  });

  it('rejects a disk-storage file over the 5MB size cap', async () => {
    const files = [diskStorageFile({ size: 5 * 1024 * 1024 + 1 })];
    await expect(productImageFilePipe.transform(files)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects a disallowed mimetype even with no buffer present', async () => {
    const files = [diskStorageFile({ mimetype: 'text/html', originalname: 'x.html' })];
    await expect(productImageFilePipe.transform(files)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects the whole batch if any one file in a multi-file upload fails validation', async () => {
    const files = [
      diskStorageFile(),
      diskStorageFile({ mimetype: 'application/pdf', originalname: 'x.pdf' }),
    ];
    await expect(productImageFilePipe.transform(files)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});
