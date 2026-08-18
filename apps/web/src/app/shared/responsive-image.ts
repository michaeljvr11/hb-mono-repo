import { ImageVariantSet } from '@hb/shared';

/**
 * Structural shape `buildResponsiveImage` actually reads. `ProductImageDto`
 * satisfies this directly (its `url`/`width`/`height`/`variants` fields are
 * flat). Vendor branding (`VendorDto.logoUrl`/`logo`, `bannerUrl`/`banner`)
 * doesn't — its metadata lives on a separate nested `UploadedImageDto` — so
 * callers there adapt by hand: `{ url: vendor.logoUrl, ...vendor.logo }`.
 * One helper, two shapes bridged at the call site rather than inside it
 * (PIO-4/PIO-5 decision — no second helper).
 */
export interface ResponsiveImageSource {
  url: string;
  width?: number;
  height?: number;
  variants?: ImageVariantSet;
}

/**
 * Resolved `<img>` attributes for a `ResponsiveImageSource`. Pure/SSR-safe —
 * no DOM access, just data shaping.
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
 * Turns any `ResponsiveImageSource` (a product image, or a vendor's logo/banner
 * adapted to the shape) into the attributes an `<img>` needs to render the
 * responsive WebP derivative set (no JPEG fallback was generated, so a plain
 * `srcset`/`sizes` pair is enough — no `<picture>` needed).
 *
 * `variants` may be entirely absent (legacy pre-PIO-2/PIO-5 row) or have any
 * subset of its members absent — a preset this asset type doesn't use at all
 * (a logo has no `card`; a banner has no `thumbnail`) or one skipped because
 * it would have duplicated a larger one on a small source. Either way this
 * only ever emits descriptors for the members that actually exist.
 */
export function buildResponsiveImage(image: ResponsiveImageSource): ResponsiveImageAttrs {
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
