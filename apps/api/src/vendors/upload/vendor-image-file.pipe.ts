import { HttpStatus, ParseFilePipeBuilder } from '@nestjs/common';

// Shared by both branding-image routes (logo/banner). `fallbackToMimetype: true` is
// required: FileTypeValidator's default magic-number check reads `file.buffer`, which
// disk storage never populates (file.filename is set instead) — without the fallback
// every disk-stored upload fails validation with a false 422, after Multer has already
// written the file to disk.
export const vendorImageFilePipe = new ParseFilePipeBuilder()
  .addFileTypeValidator({
    fileType: /(jpg|jpeg|png|webp)$/,
    fallbackToMimetype: true,
  })
  .addMaxSizeValidator({
    maxSize: 5 * 1024 * 1024, // 5MB
  })
  .build({
    fileIsRequired: true,
    errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  });
