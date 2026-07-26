import { BadRequestException } from '@nestjs/common';
import { vendorImageMulterOptions } from './vendor-image.multer.config';

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
