import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { ProcessedImageVariant } from './image-processor.types';

/** One derivative written to disk — the raw material for both a `CreateProductImageDto`'s
 * flat fields and its `variants` map. `filename` is what `FileUrlService.getFileUrl()` turns
 * into the public URL; nothing here is ever derived from the caller-supplied filename. */
export interface WrittenImageVariant {
  preset: string;
  filename: string;
  path: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Writes `ImageProcessorService` output to local disk. Kept separate from the processor
 * itself so the processor stays a pure buffer-in/buffer-out transform, reusable without any
 * assumption about where (or whether) its output is persisted.
 *
 * Filenames are always `<keyStem>-<preset>.webp` — the extension comes from the processor's
 * fixed output format, never from the original upload's mimetype or `originalname`.
 */
@Injectable()
export class ImageVariantWriterService {
  async write(
    variants: ProcessedImageVariant[],
    destDir: string,
    keyStem: string,
  ): Promise<WrittenImageVariant[]> {
    await mkdir(destDir, { recursive: true });

    return Promise.all(
      variants.map(async (variant): Promise<WrittenImageVariant> => {
        const filename = `${keyStem}-${variant.preset}.${variant.format}`;
        const path = join(destDir, filename);
        await writeFile(path, variant.buffer);

        return {
          preset: variant.preset,
          filename,
          path,
          width: variant.width,
          height: variant.height,
          sizeBytes: variant.sizeBytes,
        };
      }),
    );
  }
}
