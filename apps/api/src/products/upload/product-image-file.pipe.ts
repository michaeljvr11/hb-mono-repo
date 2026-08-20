import { HttpStatus, ParseFilePipeBuilder } from '@nestjs/common';

// Mirrors vendorImageFilePipe (apps/api/src/vendors/upload/vendor-image-file.pipe.ts).
// Both upload paths are memoryStorage since PIO-2/PIO-5, so FileTypeValidator's default
// magic-number check has a real `file.buffer` to inspect and is the primary check.
// `fallbackToMimetype: true` is kept deliberately, but only covers what magic numbers
// cannot reach: file-type returns nothing for buffers it can't fingerprint (plain text,
// HTML), and rejecting those outright would 422 on formats it simply doesn't know. When
// the bytes ARE identifiable they decide, and a mismatched mimetype loses — see
// ./product-image-file.pipe.spec.ts. It is a safety net, not the intended path.
//
// Nest loads `file-type` (ESM-only) via dynamic import, which throws under ts-jest/CJS
// unless Jest runs with --experimental-vm-modules; `apps/api/package.json`'s `test` script
// sets that. Without it the validator degrades to trusting `file.mimetype` and the
// spoofing tests in the spec fail.
//
// fileIsRequired stays false: product images are optional (ProductsController.create
// defaults `files` to `[]`), unlike the vendor logo/banner routes where a file is required.
export const productImageFilePipe = new ParseFilePipeBuilder()
  .addFileTypeValidator({
    fileType: /(jpg|jpeg|png|webp)$/,
    fallbackToMimetype: true,
  })
  .addMaxSizeValidator({
    maxSize: 5 * 1024 * 1024, // 5MB
  })
  .build({
    fileIsRequired: false,
    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  });
