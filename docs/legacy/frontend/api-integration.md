# Frontend API Integration

## Source Of Truth

Use these backend docs as the contract baseline:

- `../docs/api-contracts.md`
- `../hb-backend/docs/endpoints.md`

## Current Integration Pattern

- API base URL should come from `src/environments/environment*.ts`.
- API calls should live in Angular services.
- Components should consume typed service methods, not assemble request URLs themselves.
- `AuthService` stores the backend `access_token` in local storage and exposes the current backend `UserResponseDto` shape.
- `authInterceptor` attaches `Authorization: Bearer <access_token>` through `provideHttpClient(withInterceptors(...))`.
- Auth requests that interact with refresh-token cookies use `withCredentials: true`.

## Recommended Structure

- `core/` for shared cross-cutting services like auth, interceptors, and guards
- `core/api/` for early shared API services while the app is still scaffold-stage
- feature services for domain-specific API calls such as products, vendors, categories, cart, and orders once those feature areas are built out
- dedicated `models/` or `interfaces/` close to the feature consuming them

## Current Auth Contract

- Backend login/register/refresh return `access_token` and `user`.
- Backend login also currently includes `refresh_token` in the body, while the controller sets the `RefreshToken` HttpOnly cookie.
- Frontend `User` uses `id: string`, optional profile names, and a single `role: 'customer' | 'vendor' | 'admin'`.
- Frontend stores only `access_token`; refresh-token handling is delegated to the backend cookie flow.
- Login submits `LoginRequest` through `AuthService.login`.
- Registration submits `RegisterRequest` through `AuthService.register` with a customer role by default.

## Current API Services

- `core/api/products.service.ts`
  - public `GET /products`, `GET /products/:id`
  - protected `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`
  - image upload uses multipart field name `images`
- `core/api/categories.service.ts`
  - public `GET /categories`, `GET /categories/:id`
  - protected admin create/update/delete endpoints
- `core/api/vendors.service.ts`
  - protected vendor/admin endpoints matching `VendorsController`
  - status updates use `{ status: 'approved' | 'rejected' | 'suspended' }`

## Integration Guidance

- Mirror backend DTO and response names closely where practical.
- Prefer one interface per response envelope when the backend returns wrapped payloads.
- If backend DTOs change, update frontend models and the related service methods in the same task.
- For authenticated endpoints, centralize bearer-token attachment in the interceptor rather than per-call header logic.
- Keep file upload handling isolated in product/vendor services when that work begins.

## Suggested Next Service Areas

- revisit post-auth redirects when protected storefront routes are active
- build storefront components against `ProductsService` and `CategoriesService`
- build vendor/admin screens against `VendorsService`
- later: `cart.service`, `orders.service`, `payments.service` when backend behavior exists
