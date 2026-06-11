# Entities And DTOs

## Entities

### `User`

File: `src/users/entities/user.entity.ts`

Important fields:

- `id: string`
- `email: string` unique
- `password: string` hashed on insert
- `role: 'customer' | 'vendor' | 'admin'`
- `isActive: boolean`
- `firstName?: string`
- `lastName?: string`
- `createdAt: Date`
- `updatedAt: Date`
- `currentRefreshToken?: string`
- `currentRefreshTokenExp?: Date`

Notes:

- Password hashing uses `@BeforeInsert`.
- Commented-out vendor relation exists but is not active on the user side.

### `Vendor`

File: `src/vendors/entities/vendor.entity.ts`

Important fields:

- `id`
- `businessName` unique
- `tradingName?`
- `registrationNumber?`
- `website?`
- `description?`
- `status: pending | approved | rejected | suspended`
- `verificationDocumentUrl?`
- `userId`
- `createdAt`
- `updatedAt`

Relationships:

- one-to-one with `User` via `userId`
- one-to-many with `Product`

### `Product`

File: `src/products/entities/product.entity.ts`

Important fields:

- `id`
- `name`
- `description`
- `price`
- `stockQuantity`
- `vendorId`
- `createdAt`
- `updatedAt`

Relationships:

- many-to-one with `Vendor`
- one-to-many with `ProductImage`
- many-to-many with `Category` through `product_categories`

### `ProductImage`

File: `src/products/entities/product-image.entity.ts`

Important fields:

- `id`
- `url`
- `key?`
- `isPrimary`
- `displayOrder`
- `altText?`
- `productId`
- `createdAt`
- `updatedAt`

Relationships:

- many-to-one with `Product`
- cascade delete when parent product is removed

### `Category`

File: `src/categories/entities/category.entity.ts`

Important fields:

- `id`
- `name` unique
- `slug?` unique
- `description?`
- `displayOrder`
- `parentId?`
- `createdAt`
- `updatedAt`

Relationships:

- self-referencing parent/children category hierarchy
- many-to-many with `Product`

## Request DTOs

### Auth

- `RegisterDto`
  - validates `email`
  - requires `password` with minimum length 8
  - optional `firstName`, `lastName`, `role`
- `LoginDto`
  - validates `email`
  - requires `password`

### Vendors

- `CreateVendorDto`
  - requires `businessName`
  - optional `tradingName`, `registrationNumber`, `website`, `description`
- `AdminCreateVendorDto`
  - same core vendor fields
  - optional `userId`
  - optional `status`
- `UpdateVendorDto`
  - requires `businessName`
  - optional `tradingName`, `website`, `description`
  - `registrationNumber` is not present here

### Products

- `ProductCreateDto`
  - requires `name`, `description`, `price`
  - optional `stockQuantity`, `vendorId`, `categoryIds`
  - numeric transforms use `@Type(() => Number)`
- `ProductUpdateDto`
  - optional `name`, `description`, `price`, `stockQuantity`, `vendorId`, `categoryIds`

### Categories

- `CreateCategoryDto`
  - requires `name`
  - optional `slug`, `description`, `displayOrder`, `parentId`
- `UpdateCategoryDto`
  - optional `name`, `slug`, `description`, `displayOrder`, `parentId`

## Response DTOs

- `AuthResponseDto`
  - `access_token`
  - `user: { id, email, role, firstName?, lastName? }`
- `UserResponseDto`
  - `id`, `email`, `firstName?`, `lastName?`, `name?`, `role`
- `ProductResponseDto`
  - `id`, `name`, `description`, `price`, `stockQuantity`, `images`, `vendor`, `categories`, `createdAt`, `updatedAt`

## Validation Notes

- Backend validation relies on the global Nest `ValidationPipe`.
- DTO decorators come from `class-validator`.
- Numeric coercion in product DTOs uses `class-transformer`.
- Some inline request bodies exist, such as vendor status update body. Those are less self-documenting than DTO classes.

## Needs Verification

- Exact service-layer response DTO usage for vendors and categories.
- Whether future vendor/user bidirectional relations will be enabled on the entity layer.
