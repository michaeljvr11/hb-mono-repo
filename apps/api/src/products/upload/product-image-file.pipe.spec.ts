import { UnprocessableEntityException } from '@nestjs/common';
import { productImageFilePipe } from './product-image-file.pipe';

// Since PIO-2 the product upload path is memoryStorage (see ./multer.config.ts), so
// `file.buffer` is populated on every request and FileTypeValidator's magic-number check
// is the primary validation — the client-supplied `mimetype` is no longer trusted on its
// own. These tests exercise that path for real: `apps/api/package.json` runs Jest via
// `node --experimental-vm-modules`, without which Nest's dynamic `import()` of the
// ESM-only `file-type` package throws ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG and the
// validator silently degrades to trusting `file.mimetype`.
//
// Fixtures are real (if tiny) encoded images, not bare signatures. file-type@21 parses
// enough structure that an 8-byte PNG signature alone is NOT detectable — a fixture like
// that would quietly fall through to the mimetype fallback and prove nothing.
const REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const REAL_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);
const REAL_WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
// Not on the allow-list, but a shape file-type can positively fingerprint.
const REAL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const REAL_PDF = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1');
// MZ header — a Windows executable renamed to .png is the payload this pipe exists to stop.
const WINDOWS_EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

const uploaded = (overrides: Partial<Express.Multer.File> = {}) =>
  ({
    fieldname: 'images',
    originalname: 'photo.png',
    mimetype: 'image/png',
    buffer: REAL_PNG,
    size: REAL_PNG.length,
    ...overrides,
  }) as Express.Multer.File;

describe('productImageFilePipe — magic-number validation', () => {
  it('accepts real PNG, JPEG and WebP buffers whose bytes match their declared mimetype', async () => {
    const files = [
      uploaded({ buffer: REAL_PNG, mimetype: 'image/png', size: REAL_PNG.length }),
      uploaded({ buffer: REAL_JPEG, mimetype: 'image/jpeg', size: REAL_JPEG.length }),
      uploaded({ buffer: REAL_WEBP, mimetype: 'image/webp', size: REAL_WEBP.length }),
    ];
    await expect(productImageFilePipe.transform(files)).resolves.toBe(files);
  });

  // The core of PIO-2: the declared mimetype is on the allow-list, so the Multer
  // fileFilter and any mimetype-only check would wave these through. Only reading the
  // actual bytes rejects them.
  it('rejects a Windows executable disguised as image/png', async () => {
    const files = [
      uploaded({ buffer: WINDOWS_EXE, size: WINDOWS_EXE.length, originalname: 'payload.png' }),
    ];
    await expect(productImageFilePipe.transform(files)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects a PDF disguised as image/jpeg', async () => {
    const files = [
      uploaded({
        buffer: REAL_PDF,
        mimetype: 'image/jpeg',
        size: REAL_PDF.length,
        originalname: 'invoice.jpg',
      }),
    ];
    await expect(productImageFilePipe.transform(files)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  // A real image, but of a format the allow-list deliberately excludes (no animated GIFs).
  // The declared mimetype claims PNG; the bytes say GIF, and the bytes win.
  it('rejects a real GIF declared as image/png', async () => {
    const files = [uploaded({ buffer: REAL_GIF, size: REAL_GIF.length })];
    await expect(productImageFilePipe.transform(files)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects the whole batch when a single file in a multi-file upload is spoofed', async () => {
    const files = [
      uploaded(),
      uploaded({ buffer: WINDOWS_EXE, size: WINDOWS_EXE.length, originalname: 'payload.png' }),
      uploaded({ buffer: REAL_JPEG, mimetype: 'image/jpeg', size: REAL_JPEG.length }),
    ];
    await expect(productImageFilePipe.transform(files)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

describe('productImageFilePipe — size cap and optional files', () => {
  it('rejects a file over the 5MB size cap even when its bytes are a valid image', async () => {
    const files = [uploaded({ size: 5 * 1024 * 1024 + 1 })];
    await expect(productImageFilePipe.transform(files)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('accepts an empty or absent file list (product images are optional)', async () => {
    await expect(productImageFilePipe.transform(undefined)).resolves.toBeUndefined();
    await expect(productImageFilePipe.transform([])).resolves.toEqual([]);
  });
});

// `fallbackToMimetype: true` is retained on the pipe, so it is worth pinning down exactly
// how far the magic-number check reaches and where it hands back to the declared mimetype.
// These are the real limits of the validator, not a description of a broken test setup.
describe('productImageFilePipe — documented limits of fallbackToMimetype', () => {
  it('falls back to the declared mimetype when the bytes cannot be fingerprinted at all', async () => {
    // Plain text has no signature file-type recognises, so there is nothing to contradict
    // the declared mimetype and the fallback accepts it. Content-sniffing cannot reject
    // what it cannot identify; the image processor downstream is what ultimately fails on
    // a non-image (see ProductsService.createWithImages).
    const notAnImage = Buffer.from('plain text, not an image at all');
    const files = [uploaded({ buffer: notAnImage, size: notAnImage.length })];
    await expect(productImageFilePipe.transform(files)).resolves.toBe(files);
  });

  it('rejects an unfingerprintable buffer whose declared mimetype is off the allow-list', async () => {
    const html = Buffer.from('<html></html>');
    const files = [
      uploaded({ buffer: html, mimetype: 'text/html', size: html.length, originalname: 'x.html' }),
    ];
    await expect(productImageFilePipe.transform(files)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('still validates a buffer-less file via the mimetype fallback', async () => {
    // memoryStorage always populates `buffer`, so this is defensive rather than a live
    // path today — it keeps the fallback honest if storage is ever switched back.
    const files = [uploaded({ buffer: undefined, filename: 'uuid-generated.png' })];
    await expect(productImageFilePipe.transform(files)).resolves.toBe(files);
  });
});
