export class CreateProductImageDto {
  url: string;
  key: string;
  isPrimary?: boolean;
  displayOrder?: number;
  altText?: string;
}
