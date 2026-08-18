import { ProductImageDto } from '@hb/shared';

/**
 * Resolved `<img>` attributes for a `ProductImageDto`. Pure/SSR-safe — no
 * DOM access, just data shaping.
 */
export interface ResponsiveImageAttrs {
  /** Always set — the `full` derivative for processed rows, the raw original for legacy rows. */
  src: string;
  /** Comma-separated `url Nw` descriptors built from whichever `variants` members exist. Undefined when `variants` is absent (legacy row) — render `src` alone. */
  srcset?: string;
  /** Intrinsic width of `src`, when known (absent on legacy rows). */
  width?: number;
  /** Intrinsic height of `src`, when known (absent on legacy rows). */
  height?: number;
}

/**
 * Turns a `ProductImageDto` into the attributes an `<img>` needs to render
 * the responsive WebP derivative set (no JPEG fallback was generated, so a
 * plain `srcset`/`sizes` pair is enough — no `<picture>` needed).
 *
 * `variants` may be entirely absent (legacy pre-PIO-2 row) or have any subset
 * of its members absent (a preset skipped because it would have duplicated a
 * larger one on a small source) — this only ever emits descriptors for the
 * members that actually exist.
 */
export function buildResponsiveImage(image: ProductImageDto): ResponsiveImageAttrs {
  const variants = image.variants;
  const members = variants
    ? [variants.thumbnail, variants.card, variants.full].filter(
        (variant): variant is NonNullable<typeof variant> => !!variant,
      )
    : [];

  const srcset = members.length
    ? members
        .slice()
        .sort((a, b) => a.width - b.width)
        .map((variant) => `${variant.url} ${variant.width}w`)
        .join(', ')
    : undefined;

  return {
    src: image.url,
    srcset,
    width: image.width,
    height: image.height,
  };
}
