// Mirrors hb-landing's `src/app/shared/constants/image.constants.ts` (LSM-1).
// Deviation from the source: hb-landing used root-relative-less paths
// (e.g. 'logos/hb-logo.png'). `apps/web` is a routed SSR app — a relative
// asset path resolves against the *current route*, not the app root, so it
// breaks the moment it's rendered from a nested URL. These are leading-slash
// absolute paths instead, which always resolve against the origin.
//
// The files themselves are generated from `apps/web/brand-assets/` by
// `scripts/optimize-brand-assets.py`. The widths below must match the
// `HERO_WIDTHS` that script emits — see docs/design/BRAND-ASSET-PIPELINE.md.

/**
 * A raster asset published at several widths in two formats: WebP for browsers
 * that support it, JPEG for the long tail. Consumed by a `<picture>` element.
 */
export interface ResponsiveImage {
  /** Fallback `src`, used only by browsers that ignore `srcset` entirely. */
  readonly src: string;
  /** `srcset` for the WebP `<source>`. */
  readonly webpSrcset: string;
  /** `srcset` for the JPEG `<img>`. */
  readonly jpegSrcset: string;
  /** Intrinsic width of the largest variant — reserves the box, preventing CLS. */
  readonly width: number;
  /** Intrinsic height of the largest variant. */
  readonly height: number;
}

/** Every marketing hero is full-bleed, so the rendered width is the viewport width. */
export const HERO_SIZES = '100vw';

const responsive = (
  stem: string,
  widths: readonly number[],
  width: number,
  height: number,
): ResponsiveImage => ({
  src: `${stem}-${widths[widths.length - 1]}.jpg`,
  webpSrcset: widths.map((w) => `${stem}-${w}.webp ${w}w`).join(', '),
  jpegSrcset: widths.map((w) => `${stem}-${w}.jpg ${w}w`).join(', '),
  width,
  height,
});

const HERO_WIDTHS = [640, 960, 1280, 1536] as const;

export const SITE_IMAGES = {
  /**
   * Ships on every route, so it is deliberately a single small file rather than a
   * `<picture>` set — at well under 1 KB the format negotiation would cost more
   * markup than it saves bytes. 96px covers its 32px (nav) and 28px (footer)
   * render sizes at DPR 3.
   */
  logo: '/logos/hb-logo.png',
  /** Not yet referenced by any page — kept for the landing-page card. */
  hero: responsive('/images/hero-import-shopping', HERO_WIDTHS, 1536, 1024),
  aboutHero: responsive('/images/about-puzzle-pieces', HERO_WIDTHS, 1536, 1024),
  servicesHero: responsive('/images/services-shopping-cart', HERO_WIDTHS, 1536, 1024),
  /** Source is only 1168px wide; upscaled variants would cost bytes for no detail. */
  contactHero: responsive('/images/contact-hero-image', [640, 960, 1168], 1168, 784),
} as const;
