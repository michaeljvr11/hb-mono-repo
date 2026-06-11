# API Contracts

Source of truth: `hb-backend`.

## Auth

### `POST /api/auth/register`

- Purpose: Register a user account.
- Body: `RegisterDto`
  - `email: string`
  - `password: string` with minimum length 8
  - `firstName?: string`
  - `lastName?: string`
  - `role?: 'customer' | 'vendor' | 'admin'`
- Response: Auth/user payload from auth service.
- Notes: Public route.

### `POST /api/auth/login`

- Purpose: Authenticate a user.
- Body: `LoginDto`
  - `email: string`
  - `password: string`
- Response:
  - `access_token: string`
  - `user: { id, email, role, firstName?, lastName? }`
- Notes:
  - Public route.
  - Sets `RefreshToken` HttpOnly cookie.
  - Frontend auth model currently expects `token`, not `access_token`. `Needs verification`.

### `POST /api/auth/refresh`

- Purpose: Rotate refresh token and issue a new access token.
- Request source: `RefreshToken` cookie.
- Response:
  - `access_token: string`
  - `user: { id, email, role, firstName?, lastName? }`
- Notes: Public route guarded by Passport refresh strategy.

### `POST /api/auth/logout`

- Purpose: Clear stored refresh token and cookie.
- Auth: JWT required.
- Response:
  - `message: 'Logged out'`

### `GET /api/auth/test`

- Purpose: Confirm JWT-authenticated access.
- Auth: JWT required.
- Response: message plus current user id, email, and role.

### `GET /api/auth/vendor-test`

- Purpose: Confirm vendor/admin role access.
- Auth: JWT required.
- Roles: `vendor` or `admin`
- Response: message plus vendor email.

## Users

### `GET /api/users/me`

- Purpose: Return current authenticated user profile.
- Auth: JWT required.
- Response: `UserResponseDto`
  - `id`
  - `email`
  - `firstName?`
  - `lastName?`
  - `name?`
  - `role`

## Vendors

### `GET /api/vendors`

- Purpose: List vendors.
- Auth: JWT required.
- Roles: `admin`
- Response: Vendor list.
- Notes: Exact response DTO usage is `Needs verification`.

### `POST /api/vendors/admin`

- Purpose: Admin creates a vendor, optionally linked to a user.
- Auth: JWT required.
- Roles: `admin`
- Body: `AdminCreateVendorDto`
  - `businessName`
  - `tradingName?`
  - `registrationNumber?`
  - `website?`
  - `description?`
  - `userId?`
  - `status?: 'pending' | 'approved' | 'rejected' | 'suspended'`

### `POST /api/vendors`

- Purpose: Create vendor profile for current vendor user.
- Auth: JWT required.
- Roles: `vendor`
- Body: `CreateVendorDto`
  - `businessName`
  - `tradingName?`
  - `registrationNumber?`
  - `website?`
  - `description?`

### `PATCH /api/vendors/:id/status`

- Purpose: Update vendor approval status.
- Auth: JWT required.
- Roles: `admin`
- Params:
  - `id: string`
- Body:
  - `status: 'approved' | 'rejected' | 'suspended'`

### `GET /api/vendors/me`

- Purpose: Get current vendor profile.
- Auth: JWT required.
- Roles: `vendor`

### `GET /api/vendors/:id`

- Purpose: Get vendor by id.
- Auth: JWT required.
- Notes: Controller comment suggests public or admin-only behavior may change later. `Needs verification`.

### `PATCH /api/vendors/:id`

- Purpose: Update vendor profile.
- Auth: JWT required.
- Roles: `vendor`, `admin`
- Body: `UpdateVendorDto`
  - `businessName`
  - `tradingName?`
  - `website?`
  - `description?`

### `DELETE /api/vendors/:id`

- Purpose: Delete vendor.
- Auth: JWT required.
- Roles: `admin`

## Products

### `POST /api/products`

- Purpose: Create a product, optionally with up to 8 uploaded images.
- Auth: JWT required.
- Roles: `vendor`, `admin`
- Body: `ProductCreateDto`
  - `name`
  - `description`
  - `price: number`
  - `stockQuantity?: number`
  - `vendorId?: string`
  - `categoryIds?: string[]`
- Files:
  - field name: `images`
  - max files: 8
  - allowed types: `jpg`, `jpeg`, `png`, `webp`
  - max size: 5MB
- Response: `ProductResponseDto`

### `GET /api/products`

- Purpose: Public product listing.
- Auth: Public.
- Response: Product array.

### `GET /api/products/:id`

- Purpose: Public product detail.
- Auth: Public.
- Params:
  - `id: string`
- Response: `ProductResponseDto`

### `PATCH /api/products/:id`

- Purpose: Update a product.
- Auth: JWT required.
- Roles: `vendor`, `admin`
- Params:
  - `id: string`
- Body: `ProductUpdateDto`
  - `name?`
  - `description?`
  - `price?`
  - `stockQuantity?`
  - `vendorId?`
  - `categoryIds?`

### `DELETE /api/products/:id`

- Purpose: Delete a product.
- Auth: JWT required.
- Roles: `vendor`, `admin`
- Response: No content intended via `204`.

## Categories

### `GET /api/categories`

- Purpose: Public category listing.
- Auth: Public.

### `GET /api/categories/:id`

- Purpose: Public category detail.
- Auth: Public.
- Params:
  - `id: string`

### `POST /api/categories`

- Purpose: Create category.
- Auth: JWT required.
- Roles: `admin`
- Body: `CreateCategoryDto`
  - `name`
  - `slug?`
  - `description?`
  - `displayOrder?`
  - `parentId?`

### `PATCH /api/categories/:id`

- Purpose: Update category.
- Auth: JWT required.
- Roles: `admin`
- Params:
  - `id: string`
- Body: `UpdateCategoryDto`

### `DELETE /api/categories/:id`

- Purpose: Delete category.
- Auth: JWT required.
- Roles: `admin`

## Placeholder Domains

- `/api/orders` controller exists but meaningful endpoint behavior is not implemented.
- `cart`, `payments`, `addresses`, and `shipping` modules are scaffolded only.
