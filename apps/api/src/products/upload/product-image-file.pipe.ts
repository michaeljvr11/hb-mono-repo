import { HttpStatus, ParseFilePipeBuilder } from '@nestjs/common';

// Mirrors vendorImageFilePipe (apps/api/src/vendors/upload/vendor-image-file.pipe.ts).
// Both upload paths are memoryStorage since PIO-2/PIO-5, so FileTypeValidator's default
// magic-number check has a real `file.buffer` to inspect and is the primary check.
// `fallbackToMimetype: true` is kept deliberately: Nest loads the ESM-only `file-type`
// package by dynamic import, which fails under ts-jest/CJS, and without the fallback every
// upload would 422 in that environment. It is a safety net, not the intended path.
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
