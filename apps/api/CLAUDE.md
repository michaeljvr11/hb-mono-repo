# @hb/api — Backend Conventions (NestJS 11 + TypeORM + Postgres)

## Module map
- `auth/ users/ products/ categories/ vendors/` — migrated, working
- `addresses/ cart/ orders/` — domain skeleton (entities + module wiring)
- `payments/ shipping/` — **ports + stubs only, deliberate.** `PAYMENT_PROVIDER` /
  `SHIPPING_PROVIDER` injection tokens. Adding a real provider = one adapter class +
  one line in the module. Do not wire real providers without an explicit card.
- `common/` — decorators, guards, mappers, config utils
- `config/` — TypeORM options factory (one source of truth for app + CLI)
- `database/` — `data-source.ts` (CLI) + `migrations/`

## Rules
- Feature-per-module. Thin controllers; logic in services/providers.
- Every input is a DTO class validated with class-validator that `implements` the
  matching interface from `@hb/shared`. Never redefine contracts locally.
- Global prefix is set once via `setGlobalPrefix('api')` — controllers use plain paths.
- **Relative imports only.** `src/...` absolute imports break `node dist/main` in prod.
- Schema changes: write/generate a migration (`npm run migration:generate`, then review it).
  `synchronize` is off everywhere; keep it off.
- Money: `numeric(12,2)` + currency column. Country/currency via the shared Postgres
  enums (`country_code`, `currency_code`). Orders/shipments carry origin/destination —
  that pair is the cross-border seam (`at_border`, `customs_cleared` are first-class).
- Listings: `products.vendorId` nullable + DB CHECK — vendor listings must have a vendor,
  platform listings must not. Enforced in `ProductsService.createWithImages`.
- Auth is settled: JWT access + rotating hashed refresh token in httpOnly cookie, global
  `JwtAuthGuard`/`RolesGuard` with `@Public`/`@Roles`. Don't redesign it.
- `ValidationPipe` runs with `whitelist + transform` — rely on it, don't hand-strip fields.
- Use `bcryptjs` (no native bcrypt). File uploads use disk storage; `uploads/` is served statically.

## Testing
- Jest, `*.spec.ts` next to source. Run: `npm run test` (from `apps/api`) or `npm run test:api` (root).
- Any money/inventory/order-state logic gets a focused unit test in the same PR.
- tsconfig is intentionally loose (`strictNullChecks: false`) for migrated code; new
  modules should still be written null-safe. `@hb/shared` is fully strict.
