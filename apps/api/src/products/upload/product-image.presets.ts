import { ImagePreset } from '../../common/image-processing/image-processor.types';

/**
 * Locked decision (vault: "Product Image Optimization Pipeline", 2026-08-18). `full` is
 * listed first: it is the canonical derivative (`ProductImage.url`), so its dimensions/size
 * populate the flat `width`/`height`/`sizeBytes` columns alongside the `variants` map.
 */
export const PRODUCT_IMAGE_PRESETS: ImagePreset[] = [
  { name: 'full', maxDimension: 2000, targetBytes: 500 * 1024 },
  { name: 'card', maxDimension: 800, targetBytes: 200 * 1024 },
  { name: 'thumbnail', maxDimension: 300, targetBytes: 100 * 1024 },
];
