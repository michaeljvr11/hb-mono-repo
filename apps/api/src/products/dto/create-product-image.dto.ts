import { ProductImageVariantSet } from '@hb/shared';

export class CreateProductImageDto {
  url: string;
  key: string;
  isPrimary?: boolean;
  displayOrder?: number;
  altText?: string;
  /** Intrinsic dimensions + byte size of `url` (the `full` derivative once processed). */
  width?: number;
  height?: number;
  sizeBytes?: number;
  /** The thumbnail/card/full derivative set produced by the image processor. */
  variants?: ProductImageVariantSet;
}
