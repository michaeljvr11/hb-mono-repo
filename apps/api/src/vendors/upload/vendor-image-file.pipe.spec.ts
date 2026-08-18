import { UnprocessableEntityException } from '@nestjs/common';
import { vendorImageFilePipe } from './vendor-image-file.pipe';

// PIO-5 switched vendorImageMulterOptions from diskStorage to memoryStorage, so
// `file.buffer` is now populated on every request. This reworks (not deletes) the
// regression coverage from a real bug found in review: FileTypeValidator's default
// magic-number check reads `file.buffer`, which disk storage never populated — without
// `fallbackToMimetype: true` every disk-stored upload was rejected with a false 422 after
// Multer had already written the file. That original bug can no longer reproduce (there's
// always a buffer now), so this documents the buffer-present path honestly instead of
// asserting the no-buffer scenario that's no longer how this path runs in production.
describe('vendorImageFilePipe', () => {
  const memoryStorageFile = (overrides: Partial<Express.Multer.File> = {}) =>
    ({
      fieldname: 'file',
      originalname: 'photo.png',
      mimetype: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // real PNG signature
      size: 8,
      ...overrides,
    }) as Express.Multer.File;

  it('accepts a memory-storage file with a real image buffer and an allowed mimetype', async () => {
    const file = memoryStorageFile();
    await expect(vendorImageFilePipe.transform(file)).resolves.toBe(file);
  });

  it('rejects a file over the 5MB size cap', async () => {
    const file = memoryStorageFile({ size: 5 * 1024 * 1024 + 1 });
    await expect(vendorImageFilePipe.transform(file)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects a disallowed mimetype even though a buffer is present', async () => {
    const file = memoryStorageFile({
      mimetype: 'text/html',
      originalname: 'x.html',
      buffer: Buffer.from('<html></html>'),
    });
    await expect(vendorImageFilePipe.transform(file)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects when no file is provided', async () => {
    await expect(vendorImageFilePipe.transform(undefined)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  // Honest caveat, not swept under the rug (mirrors
  // apps/api/src/products/upload/product-image-file.pipe.spec.ts): `file-type` is an
  // ESM-only package that FileTypeValidator loads via a dynamic `import()`. Under this
  // project's Jest config (ts-jest, CommonJS, no `--experimental-vm-modules`), that
  // dynamic import throws `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` — Nest logs a
  // warning and transparently falls back to `fallbackToMimetype` even when a real buffer
  // is present. So this asserts what is actually true in *this* test environment, not a
  // magic-number check this suite cannot actually drive without changing the Jest run
  // flags for the whole project. In a real (non-Jest) Node process the buffer path is live
  // and a buffer whose bytes aren't actually an image would be rejected there.
  it(
    'documents the current fallback-to-mimetype ceiling: in this Jest environment a ' +
      'buffer whose bytes are not actually an image still passes as long as the client ' +
      "mimetype is on the allow-list — file-type's ESM load fails under ts-jest/CJS " +
      'without --experimental-vm-modules, so magic-number detection never actually runs ' +
      'here even though `file.buffer` is populated. Outside Jest (real Node), the buffer ' +
      'path is live and this would be rejected.',
    async () => {
      const file = memoryStorageFile({ buffer: Buffer.from('plain text, not an image at all') });
      await expect(vendorImageFilePipe.transform(file)).resolves.toBe(file);
    },
  );
});
