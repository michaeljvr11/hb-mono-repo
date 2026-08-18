export class CreateProductImageDto {
  url: string;
  key: string;
  isPrimary?: boolean;
  displayOrder?: number;
  altText?: string;
  /** Intrinsic pixel dimensions + original size, from ProductImageDimensionsPipe's probe. */
  width?: number;
  height?: number;
  sizeBytes?: number;
}
