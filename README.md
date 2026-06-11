# HB Monorepo

Cross-border e-commerce & logistics platform bridging deliveries from **South Africa (ZA)**
into **Namibia (NA)**. Two business models share this codebase from day one:

1. **Platform-fulfilled** — HB sources/lists products and arranges cross-border delivery.
2. **Vendor marketplace** — third-party vendors sign up, list, and fulfil.

ZA/NA share a customs union (SACU) and a 1:1-pegged currency (ZAR/NAD). The data model is
explicitly country- and currency-aware anyway — the peg is data, never an assumption.

## Layout

```
hb-mono-repo/
├─ apps/
│  ├─ api/            NestJS API (TypeORM + Postgres)
│  │  ├─ src/
│  │  │  ├─ auth/ users/ products/ categories/ vendors/    ← migrated, working
│  │  │  ├─ addresses/ cart/ orders/                       ← domain skeleton (entities + module wiring)
│  │  │  ├─ payments/   PAYMENT_PROVIDER port + stub        ← no real provider (deliberate)
│  │  │  ├─ shipping/   SHIPPING_PROVIDER port + stub       ← no real courier  (deliberate)
│  │  │  ├─ common/     decorators, guards, mappers, config utils
│  │  │  ├─ config/     typeorm options factory (one source of truth)
│  │  │  └─ database/   data-source.ts (CLI) + migrations/
│  │  └─ bruno/        API request collection (carried over)
│  ├─ web/             Angular 21 app with SSR (@angular/ssr, Node Express)
└─ libs/
   └─ shared/          @hb/shared — DTO interfaces + enums, the API contract
docs/legacy/           docs carried from the original repos (pre-merge reference)
docker-compose.yml     Postgres 16 for local dev
```

## Quick start

```bash
npm install                                # root – installs all workspaces
npm run db:up                              # Postgres 16 in Docker (port 5432)
cp apps/api/.env.example apps/api/.env     # already present with dev defaults
npm run migration:run                      # create schema
npm run dev:api                            # API on http://localhost:3000/api
npm run dev:web                            # web on http://localhost:4200
npm run build                              # builds shared → api → web
```

Both apps stay **separately buildable/deployable**: `apps/api/dist` runs with
`node dist/main`; `apps/web/dist/web` contains `browser/` + `server/server.mjs`
(`npm run serve:ssr -w @hb/web`).

Verified on this skeleton: `npm install` + all three builds pass, API unit tests pass
(`npm run test:api`), web unit tests pass (`npm run test -w @hb/web`), and the SSR server
returns fully server-rendered HTML (`ng-server-context="ssr"`) for `/login`. The
migration was written by hand and compiles, but `migration:run` still needs a running
Postgres (Docker daemon wasn't available in the environment where this was set up).

## Key decisions

### Monorepo tooling: npm workspaces, not Nx
Two apps and one shared lib don't need graph tooling, caching, or generators yet. npm
workspaces keep the native Angular/Nest CLIs untouched and have zero extra config to debug.
If the repo grows (more apps/libs, CI minutes hurting), `nx init` adopts Nx onto this exact
layout without restructuring.

### Shared types: `@hb/shared` is interfaces + enums only
The contract layer is **pure TypeScript** — no class-validator, no NestJS imports — so the
browser bundle never pays for server dependencies. Backend DTO classes `implement` the
shared interfaces (compiler enforces that validation classes match the published contract);
the frontend consumes the interfaces directly and its hand-duplicated model files were
deleted. Enums use the `const`-object pattern (`UserRole.ADMIN` works in the API, plain
`'admin'` literals still type-check in templates).

Consumption: the API uses the compiled package (normal Node resolution → `node dist/main`
works with no path-alias hacks); the web app aliases `@hb/shared` to the lib **source** via
tsconfig paths (no rebuild step during web dev, no CommonJS-bailout warnings). Root scripts
build `shared` before `api`.

### ORM: TypeORM kept, `synchronize: true` removed
The entities and CRUD were solid, so TypeORM stays (switching to Prisma/Drizzle would have
been a rewrite, against the brief). What changed: schema sync is **off everywhere**, and a
hand-written initial migration (`apps/api/src/database/migrations/`) creates the full schema.
`migration:generate` / `migration:run` / `migration:revert` wired at root and app level, with
one shared connection-options factory for app and CLI.

### Country/currency awareness (structural, no behaviour)
- `CountryCode` (ZA/NA) and `CurrencyCode` (ZAR/NAD) as Postgres enums, used on **products**
  (`currency`, `originCountry`), **vendors** (`countryCode`), **addresses** (`countryCode`),
  **orders** (`currency`, `originCountry`, `destinationCountry`), **order_items**, **payments**,
  **shipments** (`fromCountry`, `toCountry`, `customsReference`).
- The origin/destination pair on orders/shipments **is** the cross-border seam; `ShipmentStatus`
  includes `at_border` / `customs_cleared` because customs is a first-class business step.
- Money: `numeric(12,2)` + explicit currency column. No FX conversion logic — peg is 1:1 today,
  and when that ever changes it's a data/migration problem, not a schema rewrite.

### Both business models in one schema
`ListingType` (`platform` | `vendor`) on products and order items. `products.vendorId` became
**nullable** with a DB CHECK constraint: vendor listings must have a vendor, platform
(first-party) listings must not. This was the one deliberate schema rework — the alternative
(a fake "house vendor" row) pollutes vendor reporting and onboarding logic. Admins creating
products produce platform listings; vendors produce vendor listings (enforced in
`ProductsService.createWithImages`). An order can mix both models; `order_items` snapshots
`listingType` + `vendorId` per line.

### Payments & shipping: ports + stubs only (per guardrails)
`PAYMENT_PROVIDER` and `SHIPPING_PROVIDER` injection tokens with small interfaces
(`payment-provider.port.ts`, `shipping-provider.port.ts`) and logging stub implementations.
Choosing Payfast/Paystack/ShipLogic/etc. later means writing one adapter class and changing
one line in the module. Payment/Shipment entities exist so the checkout flow has somewhere
to land. The Payfast placeholder keys in the old frontend environment files were **removed**
— provider config is a server-side concern behind the port.

### Angular SSR
`@angular/ssr` with the application builder (`outputMode: "server"`, Express server in
`src/server.ts`). All routes render on the server for now (`app.routes.server.ts`); flip
public catalog/marketing routes to `RenderMode.Prerender` as they appear. Client gets
hydration with event replay and fetch-based HttpClient.

Two Angular 21 specifics already handled here:
- `main.server.ts` must take a `BootstrapContext` and pass it to `bootstrapApplication`
  (missing it fails the build's route extraction with `NG0401`).
- SSRF host validation: allowed hostnames are baked in `angular.json` →
  `build.options.security.allowedHosts` (`localhost`, `127.0.0.1`). For deployed
  environments set `NG_ALLOWED_HOSTS=yourdomain.com` on the SSR server — otherwise
  requests silently fall back to client-side rendering.

## What was reworked from the original code (and why)

| Change | Why |
|---|---|
| `synchronize: true` → migrations | Non-negotiable before real data; sync can drop/alter columns silently. |
| Controllers `@Controller('api/x')` → `setGlobalPrefix('api')` | One place owns the prefix; routes are unchanged (`/api/...`). |
| `src/...` absolute imports → relative | Emitted JS kept `require('src/...')`, which breaks `node dist/main` in prod. |
| Product image upload: disk storage wired into `FilesInterceptor` | Old code used default memory storage, so `file.filename` was `undefined` and image URLs were broken. `uploads/` is now also actually served statically. |
| `products.vendorId` NOT NULL → nullable + CHECK | First-party (platform) listings have no vendor; see above. |
| `register` now issues the refresh cookie like `login` | Old register returned an access token but never persisted/set a refresh token — first refresh after registering failed. |
| `updatedAt` via `@UpdateDateColumn` | Old columns defaulted to `now()` and never updated. |
| Dropped native `bcrypt` dep, kept `bcryptjs` | Only bcryptjs was used; native bcrypt needs build tooling on Windows for nothing. |
| `users/vendors/categories` modules no longer register unrelated entities | They imported each other's repositories without using them. |
| Vendor status endpoint takes a validated DTO | Was a raw `body: { status }` with `as any` cast. |
| Frontend `localStorage` access platform-guarded | Direct access crashes SSR; `AuthService` checks `isPlatformBrowser`. |
| `ValidationPipe` → `whitelist + transform` | Strips unknown payload fields; DTO defaults actually apply. |
| Deleted empty `CoreModule`/`AuthModule`/`Auth` service shells in web | Standalone app; dead scaffolding. |

**Kept as-is deliberately:** the whole auth flow (JWT access + rotating hashed refresh token
in an httpOnly cookie, global `JwtAuthGuard`/`RolesGuard` with `@Public`/`@Roles`), ownership
checks in products/vendors services, response-DTO mapping pattern, login/register/shop UI.

## Conventions

- **Env**: `apps/api/.env` (gitignored; `.env.example` committed). No secrets in code or
  frontend environments. Frontend env files hold only `apiBaseUrl` + flags.
- **Lint/format**: root `.prettierrc` + `.editorconfig`; ESLint (flat config) on the API.
  Web relies on Angular compiler strictness + prettier; add angular-eslint when wanted.
- **API tsconfig is intentionally loose** (`strictNullChecks: false`, carried from the
  original repo so migrated code compiles untouched). Tighten module-by-module later.
  `libs/shared` is fully `strict`.
- **DB naming**: TypeORM defaults (camelCase quoted columns), Postgres enums with stable
  names (`country_code`, `currency_code`, …) shared across tables.

## Not included (on purpose)

- Payment/courier integrations, KYC, FX — future decisions; ports are ready.
- `hb-landing` (marketing site) — not part of the brief; drop it in as `apps/landing`
  if/when wanted, the workspace layout already accommodates it.
- Microservices/K8s/brokers — single modular monolith per the guardrails. Module
  boundaries (ports, no cross-module entity grabbing) are the future seams.
- Old free-form docs live in `docs/legacy/` for reference; this README is current truth.
