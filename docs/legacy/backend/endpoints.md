# Backend Endpoint Inventory

Source: controllers under `src/`.

## App

### `GET /api`

- Controller: `AppController`
- Purpose: default health/welcome response
- Response: string from `AppService`

## Auth

### `POST /api/auth/register`

- Controller: `AuthController`
- Purpose: register user
- Request DTO: `RegisterDto`
- Response DTO/model: auth response from service
- Notes: public route

### `POST /api/auth/login`

- Controller: `AuthController`
- Purpose: authenticate user
- Request DTO: `LoginDto`
- Response shape: `{ access_token, user }`
- Notes: also sets `RefreshToken` HttpOnly cookie

### `POST /api/auth/refresh`

- Controller: `AuthController`
- Purpose: refresh access token
- Request source: refresh cookie via Passport refresh strategy
- Response shape: `{ access_token, user }`

### `POST /api/auth/logout`

- Controller: `AuthController`
- Purpose: clear refresh token state
- Auth: JWT
- Response shape: `{ message: 'Logged out' }`

### `GET /api/auth/test`

- Controller: `AuthController`
- Purpose: auth smoke test
- Auth: JWT
- Response shape: `{ message, userId, email, role }`

### `GET /api/auth/vendor-test`

- Controller: `AuthController`
- Purpose: vendor/admin authorization smoke test
- Auth: JWT
- Roles: `vendor`, `admin`
- Response shape: `{ message, vendorEmail }`

## Users

### `GET /api/users/me`

- Controller: `UsersController`
- Purpose: current user profile
- Auth: JWT
- Response DTO/model: user profile from `UsersService.getProfile`

## Vendors

### `GET /api/vendors`

- Controller: `VendorsController`
- Purpose: list vendors
- Auth: JWT
- Roles: `admin`
- Response/entity/DTO: `Needs verification`

### `POST /api/vendors/admin`

- Controller: `VendorsController`
- Purpose: admin creates vendor
- Auth: JWT
- Roles: `admin`
- Request DTO: `AdminCreateVendorDto`

### `POST /api/vendors`

- Controller: `VendorsController`
- Purpose: vendor creates own vendor profile
- Auth: JWT
- Roles: `vendor`
- Request DTO: `CreateVendorDto`

### `PATCH /api/vendors/:id/status`

- Controller: `VendorsController`
- Purpose: admin changes vendor status
- Auth: JWT
- Roles: `admin`
- Params: `id`
- Body: inline `{ status }` object

### `GET /api/vendors/me`

- Controller: `VendorsController`
- Purpose: current vendor profile
- Auth: JWT
- Roles: `vendor`

### `GET /api/vendors/:id`

- Controller: `VendorsController`
- Purpose: vendor lookup by id
- Auth: JWT
- Notes: controller comment suggests future access-policy changes

### `PATCH /api/vendors/:id`

- Controller: `VendorsController`
- Purpose: update vendor
- Auth: JWT
- Roles: `vendor`, `admin`
- Params: `id`
- Request DTO: `UpdateVendorDto`

### `DELETE /api/vendors/:id`

- Controller: `VendorsController`
- Purpose: delete vendor
- Auth: JWT
- Roles: `admin`

## Products

### `POST /api/products`

- Controller: `ProductsController`
- Purpose: create product with optional image uploads
- Auth: JWT
- Roles: `vendor`, `admin`
- Request DTO: `ProductCreateDto`
- Files:
  - field: `images`
  - max count: 8
  - types: `jpg`, `jpeg`, `png`, `webp`
  - max size: 5MB
- Response DTO/model: `ProductResponseDto`

### `GET /api/products`

- Controller: `ProductsController`
- Purpose: list products
- Auth: public
- Response DTO/model: product list from `ProductsService.findAll`

### `GET /api/products/:id`

- Controller: `ProductsController`
- Purpose: get product by id
- Auth: public
- Params: `id`
- Response DTO/model: product detail from `ProductsService.findOne`

### `PATCH /api/products/:id`

- Controller: `ProductsController`
- Purpose: update product
- Auth: JWT
- Roles: `vendor`, `admin`
- Params: `id`
- Request DTO: `ProductUpdateDto`

### `DELETE /api/products/:id`

- Controller: `ProductsController`
- Purpose: delete product
- Auth: JWT
- Roles: `vendor`, `admin`
- Params: `id`
- Response: intended `204 No Content`

## Categories

### `GET /api/categories`

- Controller: `CategoriesController`
- Purpose: list categories
- Auth: public

### `GET /api/categories/:id`

- Controller: `CategoriesController`
- Purpose: get category by id
- Auth: public
- Params: `id`

### `POST /api/categories`

- Controller: `CategoriesController`
- Purpose: create category
- Auth: JWT
- Roles: `admin`
- Request DTO: `CreateCategoryDto`

### `PATCH /api/categories/:id`

- Controller: `CategoriesController`
- Purpose: update category
- Auth: JWT
- Roles: `admin`
- Params: `id`
- Request DTO: `UpdateCategoryDto`

### `DELETE /api/categories/:id`

- Controller: `CategoriesController`
- Purpose: delete category
- Auth: JWT
- Roles: `admin`

## Placeholder Resources

- `OrdersController` is present under `api/orders`, but no actionable endpoint behavior was discovered from the inspected source.
