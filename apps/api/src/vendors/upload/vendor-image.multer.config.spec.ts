import { BadRequestException } from '@nestjs/common';
import { vendorImageMulterOptions } from './vendor-image.multer.config';

// The stored filename's extension must come from a fixed mimetype allow-list, never
// from the client-supplied `originalname` — uploads/ is served statically, so trusting
// an attacker-controlled originalname extension (e.g. sending `x.html` with an allowed
// image mimetype) would let a stored file be served back as text/html from the API origin.
describe('vendorImageMulterOptions storage filename', () => {
  const runFilename = (mimetype: string, originalname: string) =>
    new Promise<{ error: Error | null; filename: string }>((resolve) => {
      const file = { mimetype, originalname } as Express.Multer.File;
      // diskStorage() only exposes _handleFile/_removeFile; reach the private
      // getFilename via the storage engine's internal option we configured.
      const storage = vendorImageMulterOptions.storage as unknown as {
        getFilename: (
          req: unknown,
          file: Express.Multer.File,
          cb: (error: Error | null, filename: string) => void,
        ) => void;
      };
      storage.getFilename({}, file, (error, filename) => resolve({ error, filename }));
    });

  it('derives the extension from mimetype, ignoring a mismatched originalname extension', async () => {
    const { error, filename } = await runFilename('image/png', 'x.html');
    expect(error).toBeNull();
    expect(filename).toMatch(/\.png$/);
  });

  it.each([
    ['image/jpg', '.jpg'],
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
  ])('maps %s to %s', async (mimetype, ext) => {
    const { filename } = await runFilename(mimetype, 'whatever.bin');
    expect(filename.endsWith(ext)).toBe(true);
  });

  it('rejects an unmapped mimetype at the filename stage too (defense in depth)', async () => {
    const { error } = await runFilename('application/octet-stream', 'x');
    expect(error).toBeInstanceOf(BadRequestException);
  });
});

// The controller's ParseFilePipeBuilder re-validates file type after Multer has already
// run (defense in depth), but the first line of defense — and the only place a
// non-image is rejected before ever touching disk — is this fileFilter. No spec exists
// yet for the identical filter on productImageMulterOptions (see
// apps/api/src/products/upload/multer.config.ts), so this is new coverage, not a
// duplicate of an existing precedent.
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
