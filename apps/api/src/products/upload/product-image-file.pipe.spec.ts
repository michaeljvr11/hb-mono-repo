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

// PIO-2 switched productImageMulterOptions to memoryStorage, so `file.buffer` is now
// populated on every request — FileTypeValidator's *primary* path (magic-number detection
// via the `file-type` package, reading `file.buffer`) becomes reachable, with
// `fallbackToMimetype` only a secondary path for buffers it can't fingerprint.
//
// Honest caveat, not swept under the rug: `file-type` is an ESM-only package that
// FileTypeValidator loads via a dynamic `import()`. Under this project's Jest config
// (ts-jest, CommonJS, no `--experimental-vm-modules`), that dynamic import throws
// `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` — Nest logs a warning and transparently
// falls back to `fallbackToMimetype` even when a real buffer is present. So these tests
// assert what is actually true in *this* test environment (mimetype-fallback behaviour,
// exercised with a real buffer present rather than none) — not a magic-number check this
// suite cannot actually drive without changing the Jest run flags for the whole project,
// which is out of scope here. In a real (non-Jest) Node process the buffer path is live.
describe('productImageFilePipe under memoryStorage (buffer populated) — PIO-2', () => {
  const memoryStorageFile = (overrides: Partial<Express.Multer.File> = {}) =>
    ({
      fieldname: 'images',
      originalname: 'photo.png',
      mimetype: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // real PNG signature
      size: 8,
      ...overrides,
    }) as Express.Multer.File;

  it('accepts a file with a real image buffer and an allowed mimetype', async () => {
    const files = [memoryStorageFile()];
    await expect(productImageFilePipe.transform(files)).resolves.toBe(files);
  });

  it('still rejects a disallowed mimetype even though a buffer is present', async () => {
    const files = [
      memoryStorageFile({ mimetype: 'text/html', buffer: Buffer.from('<html></html>') }),
    ];
    await expect(productImageFilePipe.transform(files)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it(
    'documents the current fallback-to-mimetype ceiling: in this Jest environment a ' +
      'buffer whose bytes are not actually an image still passes as long as the client ' +
      "mimetype is on the allow-list — file-type's ESM load fails under ts-jest/CJS " +
      'without --experimental-vm-modules, so magic-number detection never actually runs ' +
      'here even though `file.buffer` is populated. Outside Jest (real Node), the buffer ' +
      'path is live and this would be rejected.',
    async () => {
      const files = [memoryStorageFile({ buffer: Buffer.from('plain text, not an image at all') })];
      await expect(productImageFilePipe.transform(files)).resolves.toBe(files);
    },
  );
});
