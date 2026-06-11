# Backend Architecture

## Stack

- NestJS 11
- TypeScript
- PostgreSQL
- TypeORM
- JWT auth with Passport strategies
- `class-validator` and `class-transformer`

## Application Wiring

Defined mainly in `src/app.module.ts`:

- `ConfigModule.forRoot({ isGlobal: true })`
- `TypeOrmModule.forRoot(...)`
- global `JwtAuthGuard` via `APP_GUARD`
- global `RolesGuard` via `APP_GUARD`
- global `ValidationPipe` via `APP_PIPE`

Imported modules:

- `AuthModule`
- `UsersModule`
- `ProductsModule`
- `OrdersModule`
- `VendorsModule`
- `CartModule`
- `PaymentsModule`
- `AddressesModule`
- `ShippingModule`
- `CategoriesModule`

## Data Layer Approach

- TypeORM entities are auto-discovered with `entities: [__dirname + '/**/*.entity{.ts,.js}']`.
- Database connection is PostgreSQL-based and configured from environment variables.
- `synchronize: true` is enabled in the current app module, which is acceptable for early development but should not be treated as a production migration strategy.

## Auth And Security Patterns

- JWT bearer auth is globally enforced.
- Public endpoints require `@Public()`.
- Role checks use `@Roles(...)` and the global `RolesGuard`.
- Refresh token flow uses a Passport `refresh` strategy and reads the `RefreshToken` cookie.
- `src/main.ts` enables `cookie-parser`.

## Response Shaping

- Response mappers in `src/common/utils/mappers.utils.ts` convert entities to safer DTO-friendly payloads.
- User responses intentionally avoid returning password and refresh token fields.

## File Upload Notes

- Product image upload logic exists in `products.controller.ts` and `services/file-upload.service.ts`.
- The upload service defines Multer disk storage and file filtering.
- Static serving for uploaded files is not configured in `src/main.ts`. `Needs verification` for production-ready behavior.
- `uuid` is imported in the upload service, but package presence should be rechecked when touching upload code. `Needs verification`.

## Placeholder Areas

- Orders controller/module exists but business functionality is minimal.
- Cart, payments, addresses, and shipping are scaffolds rather than complete domains.

## Unknowns

- CORS configuration is not present in the inspected bootstrap path. `Needs verification`.
- Production deployment and secret-management approach are not documented in source. `Needs verification`.
