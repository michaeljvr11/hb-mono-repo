# Frontend Architecture

## Current State

`hb-frontend` is an early-stage Angular application with standalone app configuration, auth-oriented routing, a protected shop landing route, and environment-based API configuration.

## Structure Observed

- `src/app/app.ts`: root app component
- `src/app/app.config.ts`: router, HTTP client, interceptor, and animation providers
- `src/app/app.routes.ts`: route definitions
- `src/app/auth/...`: login, register, logout components
- `src/app/features/shop/...`: early protected shop landing component
- `src/app/core/auth/...`: auth service, interceptor, guards, models
- `src/app/core/api/...`: scaffold-stage typed services and models for backend products, categories, and vendors
- `src/environments/...`: environment-specific config

## Routing

Current active routes:

- `/login`
- `/register`
- `/shop` protected by `authGuard`
- `/` redirects to `/shop`
- catch-all redirect to `/login`

Commented route blocks indicate planned expanded user and vendor areas, but they are not active yet.

## HTTP And Auth

- `provideHttpClient(withInterceptors(...))` is configured in `app.config.ts`.
- `provideAnimationsAsync()` is configured for Angular Material overlay feedback such as snackbars.
- The configured `authInterceptor` is a functional Angular interceptor.
- Environment config provides `apiBaseUrl`.
- Auth service uses `HttpClient`, stores the backend `access_token`, and loads `/users/me` when a token is present.
- Login and registration components are standalone reactive-form screens that call the typed `AuthService` methods rather than using `HttpClient` directly.
- Successful login/register actions show Angular Material snackbars and navigate to `returnUrl` or `/shop`.
- Route guards exist in functional form.
- `authGuard` protects authenticated routes.
- `roleGuard` checks route `data.roles` against the backend single-role user model.

## State Management

- Auth state is currently handled with a `BehaviorSubject` inside `AuthService`.
- No broader state-management library was found.

## Environment Setup

- `environment.development.ts` points to `http://localhost:3000/api`
- `environment.ts` points to `https://api.hnb.co.za/api`
- Angular build config replaces `environment.ts` with the development variant during development builds.

## Early-Stage/Missing Areas

- The `/shop` route is active as a lightweight protected landing page, but full product/catalog UI is not built yet.
- Login and register have branded skeleton layouts and are connected to the existing auth service.
- Product, category, and vendor API services exist but are not yet connected to feature screens.
- Cart, orders, payments, addresses, and shipping should wait until backend endpoint behavior is implemented.

## Needs Verification

- Backend CORS cookie configuration for refresh-token flows in browser environments.
- Post-auth redirects once richer customer/vendor destinations exist.
