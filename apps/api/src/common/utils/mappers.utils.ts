import {
  ProductCategoryDto,
  ProductDto,
  ProductImageDto,
  UserDto,
} from '@hb/shared';
import { User } from '../../users/entities/user.entity';
import { Product } from '../../products/entities/product.entity';

export function UserToResponseDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name:
      user.firstName && user.lastName ? `${user.firstName} ${user.lastName}`.trim() : undefined,
    role: user.role,
  };
}

export function ProductToResponseDto(product: Product): ProductDto {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: Number(product.price),
    currency: product.currency,
    stockQuantity: product.stockQuantity ?? 0,
    originCountry: product.originCountry,
    listingType: product.listingType,

    images:
      product.images?.map(
        (img): ProductImageDto => ({
          id: img.id,
          url: img.url,
          isPrimary: img.isPrimary,
          displayOrder: img.displayOrder,
          altText: img.altText,
        }),
      ) ?? [],

    vendor: product.vendor
      ? { id: product.vendor.id, businessName: product.vendor.businessName }
      : undefined,

    categories:
      product.categories?.map(
        (cat): ProductCategoryDto => ({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
        }),
      ) ?? [],

    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
