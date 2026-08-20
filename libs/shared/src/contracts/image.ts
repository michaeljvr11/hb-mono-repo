/**
 * Shared image-derivative contract (PIO-4 design output, vault: "Product Image
 * Optimization Pipeline", 2026-08-18). One definition reused by every uploaded-image
 * owner — product images (`ProductImageDto.variants`) and vendor logo/banner (PIO-5)
 * both import these directly rather than redefining a per-owner shape.
 */

/** One resized/re-encoded derivative of an uploaded image. Always WebP (locked decision — no JPEG fallback). */
export interface ImageVariantDto {
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/** The derivative set produced per uploaded image. Any key may be absent — e.g. a preset
 * this asset type doesn't use (a logo has no `card`; a banner has no `thumbnail`), a
 * legacy row, or a preset skipped because it would have duplicated a larger one on a
 * small source. */
export interface ImageVariantSet {
  thumbnail?: ImageVariantDto;
  card?: ImageVariantDto;
  full?: ImageVariantDto;
}

/** Metadata for one uploaded image whose canonical URL lives on the owning DTO (e.g.
 * `VendorDto.logoUrl` / `ProductImageDto.url`) — this describes the `full` derivative
 * that URL points at, plus every derivative actually generated. */
export interface UploadedImageDto {
  width: number;
  height: number;
  sizeBytes: number;
  variants: ImageVariantSet;
}
