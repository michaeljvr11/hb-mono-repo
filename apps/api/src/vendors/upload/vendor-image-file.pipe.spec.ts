import { UnprocessableEntityException } from '@nestjs/common';
import { vendorImageFilePipe } from './vendor-image-file.pipe';

// Regression coverage for a real bug found in review: FileTypeValidator's default
// magic-number check reads file.buffer, which disk storage never populates. Without
// `fallbackToMimetype: true` every disk-stored upload was rejected with a false 422 —
// after Multer had already written the file to disk on every request.
describe('vendorImageFilePipe', () => {
  const diskStorageFile = (overrides: Partial<Express.Multer.File> = {}) =>
    ({
      fieldname: 'file',
      originalname: 'photo.png',
      mimetype: 'image/png',
      filename: 'uuid-generated.png',
      size: 1024,
      // disk storage: no buffer
      ...overrides,
    }) as Express.Multer.File;

  it('accepts a disk-storage file (no buffer) via the mimetype fallback', async () => {
    const file = diskStorageFile();
    await expect(vendorImageFilePipe.transform(file)).resolves.toBe(file);
  });

  it('rejects a disk-storage file over the 5MB size cap', async () => {
    const file = diskStorageFile({ size: 5 * 1024 * 1024 + 1 });
    await expect(vendorImageFilePipe.transform(file)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects a disallowed mimetype even with no buffer present', async () => {
    const file = diskStorageFile({ mimetype: 'text/html', originalname: 'x.html' });
    await expect(vendorImageFilePipe.transform(file)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects when no file is provided', async () => {
    await expect(vendorImageFilePipe.transform(undefined)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});
