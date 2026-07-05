# Security

How authentication, authorization, and data access work in the HB platform, and the
rules for keeping new code safe. This is the operational companion to the point-in-time
audit in [`docs/security/AUDIT-2026-07-02.md`](docs/security/AUDIT-2026-07-02.md) and to
the `Auth & Roles` note in the Obsidian vault (the design source of truth).

## Auth model (settled — don't redesign)

- **JWT access token** — short-lived (`JWT_EXPIRATION`, default 15m), sent as a
  `Bearer` header, held in browser memory-ish state on the web app. Stateless; validated
  by the global `JwtAuthGuard` via `JwtStrategy`.
- **Rotating refresh token** — long-lived (remember-me: 30d, else 24h), delivered **only**
  in an httpOnly cookie, stored **bcrypt-hashed** on the user row, and rotated on every
  `/auth/refresh`. `SameSite` is env-driven (`REFRESH_COOKIE_SAMESITE`, default `strict`);
  `Secure` is forced in production and whenever `SameSite=none`.
- **Password hashing** — `bcryptjs` at cost factor 12 (entity `@BeforeInsert` + on reset).
- **Password reset** — 256-bit random token, emailed raw, stored **SHA-256-hashed**, 1-hour
  expiry, single-use, and drops the refresh session on success. No user enumeration.
- **Email verification** — same token scheme (24h). Required to place orders, not to browse.
- **Google OAuth** — server-side Authorization-Code flow. CSRF-protected by a cookie-backed
  `state` store; sign-in is rejected unless Google reports the email verified. Tokens never
  travel in the URL — the callback sets the refresh cookie and the web app exchanges it.
- **Admin bootstrap** — `POST /auth/bootstrap-admin` seeds the first admin. Gated by
  `ADMIN_BOOTSTRAP_SECRET` (required in production; the endpoint is disabled if it's unset).
  Self-seals once any admin exists.

Invalidation: changing a password or logging out clears the stored refresh hash, so held
sessions can no longer refresh. Deactivating a user (`isActive=false`) fails auth on the
next request.

## Roles

One `users` table, discriminated by a `role` enum (`customer` / `vendor` / `admin`).
This single-table design is intentional — see the audit's "Database design assessment".

| Role | May |
|------|-----|
| `customer` | browse, cart, checkout, view **own** orders/addresses |
| `vendor` | everything a customer can + manage **own** vendor profile, listings, and orders |
| `admin` | manage categories, platform listings, vendor approval/suspension, all orders, users |

**Role is never client-settable.** Self-registration always creates a `customer`. Role
changes happen only through the admin-only, audited `PATCH /admin/users/:id/role`. Vendor
onboarding elevates `customer → vendor` server-side in `VendorsService.create`.

## Authorization enforcement

Enforced **server-side**, globally, secure-by-default:

- `JwtAuthGuard` and `RolesGuard` are registered as `APP_GUARD` in
  [`app.module.ts`](apps/api/src/app.module.ts). Every route requires a valid JWT unless it
  carries `@Public()`. `ThrottlerGuard` runs first for rate limiting.
- `@Roles(UserRole.X, ...)` restricts a route/controller to those roles.
- **Ownership checks live in the service layer** (e.g. `ProductsService.ensureCanManageProduct`,
  `VendorsService.update`) — this is what stops horizontal escalation (user A reaching user
  B's data). Do not hand-roll auth in controllers.
- The Angular route guards (`authGuard`, `roleGuard`) are **UX only**. They are not a
  security boundary; the API is.

## Data access rules

- **PII** (emails, names, addresses, phone) lives in Postgres, access-controlled by the
  rules above. Password / refresh / reset / verification secrets are all stored hashed,
  never in plaintext, and are never logged.
- **No raw SQL with interpolation.** Use the TypeORM repository API or parameterized query
  builders (`:param`) exclusively.
- **Every input is a DTO** implementing a `@hb/shared` contract, validated by
  class-validator under the global `ValidationPipe({ whitelist, transform })`. Never trust
  the frontend's validation; never hand-strip fields.
- Money stays `numeric(12,2)` + explicit currency; country/currency via the shared enums.

## Adding a new route — checklist

1. **Auth:** it's protected automatically. Only add `@Public()` if it is genuinely
   anonymous — and then add it to `EXPECTED_PUBLIC` in
   [`public-routes.guardrail.spec.ts`](apps/api/src/common/guards/public-routes.guardrail.spec.ts)
   (the test fails until you do). Add a new controller to that test's `CONTROLLERS` list.
2. **Role:** add `@Roles(...)` for anything above `customer`. Don't rely on the UI.
3. **Ownership:** if the route touches a specific user's/vendor's data, enforce ownership in
   the service (compare against the authenticated user), not just the role.
4. **Input:** define a DTO implementing the shared contract, with class-validator decorators.
   Never accept a `role`, `isActive`, `vendorId`, or similar privilege/ownership field from
   the client on a self-service route.
5. **Rate limiting:** add a tighter `@Throttle(...)` for auth-adjacent or email-sending
   endpoints.
6. **Tests:** money/inventory/order-state and any authz decision get a unit test in the
   same PR.

## Reporting

This is a work-in-progress build. Security issues: open a private issue or contact the
maintainer directly — do not file exploit details in a public issue.
