import { UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Absurd/decompression-bomb guard (locked decision, vault: "Product Image Optimization
 * Pipeline", 2026-08-18). Shared by every upload path that probes intrinsic pixel
 * dimensions before processing — product images (PIO-1) and vendor logo/banner uploads
 * (PIO-5) — so the ceiling exists once, not once per path.
 */
export const MAX_IMAGE_DIMENSION_PX = 8000;

export interface ProbedDimensions {
  width: number;
  height: number;
}

/**
 * Reads the intrinsic pixel dimensions of an image buffer and rejects with a 422 if it
 * can't be read as an image at all (corrupt/truncated upload) or exceeds
 * `MAX_IMAGE_DIMENSION_PX` on either edge. Never surfaces as an unhandled 500.
 *
 * `label` is only used to name the offending file in the error message (typically
 * `file.originalname`).
 */
export async function probeImageDimensions(
  buffer: Buffer,
  label: string,
): Promise<ProbedDimensions> {
  let width: number | undefined;
  let height: number | undefined;

  try {
    ({ width, height } = await sharp(buffer).metadata());
  } catch {
    // Unreadable by sharp despite passing the mimetype/magic-number check (e.g. corrupt
    // or truncated upload) — fall through to the "could not be read" rejection below.
  }

  if (!width || !height) {
    throw new UnprocessableEntityException(`Image "${label}" could not be read as an image.`);
  }

  if (width > MAX_IMAGE_DIMENSION_PX || height > MAX_IMAGE_DIMENSION_PX) {
    throw new UnprocessableEntityException(
      `Image "${label}" is ${width}x${height}px; maximum allowed is ` +
        `${MAX_IMAGE_DIMENSION_PX}x${MAX_IMAGE_DIMENSION_PX}px.`,
    );
  }

  return { width, height };
}
