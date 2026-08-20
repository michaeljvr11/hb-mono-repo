import { HttpStatus, ParseFilePipeBuilder } from '@nestjs/common';

// Shared by both branding-image routes (logo/banner). PIO-5 switched
// `vendorImageMulterOptions` to `memoryStorage`, so `file.buffer` is now populated on
// every request — FileTypeValidator's primary magic-number check (via the `file-type`
// package) becomes reachable, with `fallbackToMimetype: true` only a secondary path for
// buffers it can't fingerprint. The flag stays: this was originally added because disk
// storage never populated `file.buffer` at all (a real bug found in review — see the
// regression spec), and it remains required defense-in-depth now that a buffer is always
// present. See `vendor-image-file.pipe.spec.ts` for the honest caveat about what this
// Jest environment can actually exercise of the magic-number path.
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
