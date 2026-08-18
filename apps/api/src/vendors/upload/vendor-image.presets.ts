import { ImagePreset } from '../../common/image-processing/image-processor.types';

/**
 * Locked decisions (vault: "Product Image Optimization Pipeline", "PIO-4 design output —
 * 2026-08-18"), derived from the measured rendered size of `.vendor-profile__logo`
 * (64px, 72px at >=768px, so 144px covers a 2x DPR render of the larger breakpoint) and
 * `.vendor-profile__banner` (full-width, 21:9, inside the same max-width container as the
 * PDP). `full` is listed first — it is the canonical `logoUrl`, so its dimensions/size
 * populate the flat `logoWidth`/`logoHeight`/`logoSizeBytes` columns.
 *
 * No `card` preset for the logo, no `thumbnail` preset for the banner — each asset only
 * gets the derivatives it's actually rendered at.
 */
export const VENDOR_LOGO_PRESETS: ImagePreset[] = [
  { name: 'full', maxDimension: 512, targetBytes: 80 * 1024 },
  { name: 'thumbnail', maxDimension: 144, targetBytes: 20 * 1024 },
];

export const VENDOR_BANNER_PRESETS: ImagePreset[] = [
  { name: 'full', maxDimension: 1280, targetBytes: 350 * 1024 },
  { name: 'card', maxDimension: 640, targetBytes: 120 * 1024 },
];
