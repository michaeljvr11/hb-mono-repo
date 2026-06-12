# @hb/web — Frontend Conventions (Angular 21 SSR + Material)

## Rules
- Modern Angular only: standalone components, signals for state, typed reactive forms,
  new control-flow syntax (`@if` / `@for` / `@switch`).
- Consume API types from `@hb/shared` (aliased to lib **source** via tsconfig paths —
  no rebuild needed during dev). Never hand-duplicate models.
- Keep components small and presentational; data access lives in services under `core/api`.
- Styling follows `docs/design/DESIGN.md` tokens (colors, spacing, type scale). When
  implementing a screen, read `docs/design/<screen>/` (exported HTML + screenshot) and
  build idiomatic Angular components that match — never paste raw exported markup.
- Angular Material 21 is available; prefer it for standard controls, themed via tokens.
- Frontend env files hold only `apiBaseUrl` + flags. No secrets, no provider keys.

## SSR gotchas (already configured — don't regress)
- All browser-only APIs (`localStorage`, `window`, `document`) must be guarded with
  `isPlatformBrowser` — direct access crashes SSR. `AuthService` shows the pattern.
- `main.server.ts` takes a `BootstrapContext` and passes it to `bootstrapApplication`
  (omitting it fails route extraction with `NG0401`).
- Allowed SSR hosts live in `angular.json` → `build.options.security.allowedHosts`;
  deployed environments set `NG_ALLOWED_HOSTS`.
- All routes server-render for now (`app.routes.server.ts`); flip public catalog/marketing
  routes to `RenderMode.Prerender` as they appear.

## Testing
- Vitest via `ng test` (run from `apps/web`: `npm run test -w @hb/web` at root).
- HttpClient is fetch-based; hydration with event replay is on.
