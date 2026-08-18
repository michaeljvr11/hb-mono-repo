import { HttpStatus, ParseFilePipeBuilder } from '@nestjs/common';

// Mirrors vendorImageFilePipe (apps/api/src/vendors/upload/vendor-image-file.pipe.ts).
// `fallbackToMimetype: true` is required here for the same reason: productImageMulterOptions
// is disk storage, so FileTypeValidator's default magic-number check (which reads
// file.buffer) never has a buffer to inspect — without the fallback every disk-stored
// upload fails validation with a false 422, after Multer has already written the file.
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
