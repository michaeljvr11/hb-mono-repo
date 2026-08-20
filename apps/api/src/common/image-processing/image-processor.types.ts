/**
 * One derivative to generate from a source image. Not product- or vendor-specific — the
 * caller supplies its own preset set (see `apps/api/src/products/upload/product-image.presets.ts`
 * for the product set; PIO-5 supplies a logo/banner set the same way).
 */
export interface ImagePreset {
  /** Key this derivative is returned/stored under (e.g. 'thumbnail', 'card', 'full'). */
  name: string;
  /** Cap on the longest edge, in px. Aspect ratio preserved; never upscaled beyond intrinsic size. */
  maxDimension: number;
  /**
   * Soft byte-size target. `ImageProcessorService` steps encode quality down trying to
   * land under it; if it can't, it returns the smallest it achieved rather than failing
   * the request — this is a target, not a hard cap.
   */
  targetBytes?: number;
}

/** Output of processing a source image buffer through one `ImagePreset`. */
export interface ProcessedImageVariant {
  preset: string;
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
  /** Always 'webp' — locked decision (no JPEG fallback, one encode per derivative). */
  format: 'webp';
}
