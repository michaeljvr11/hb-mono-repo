# PROGRESS — HB Storefront Overhaul

> **This file is the truth.** On session start: find the first phase not `DONE`, read its
> "Next action", continue from exactly there. Do not re-research, re-plan or re-audit.
> Branch: `feat/storefront-visual-overhaul`. Never merge to `main`.

| Phase | Status |
|---|---|
| 0 Orient, research, plan | DONE |
| 1 Token foundation | DONE |
| 2 Desktop nav + shell | DONE |
| 3 Storefront + product card | DONE |
| 4 Trust, states, perceived performance | DONE |
| 5 PDP, cart, checkout | TODO |
| 6 Follow-up cards | TODO (kept current in `PLAN.md` §5 as phases run) |

---

## Phase 0 — Orient, research, plan — DONE
- **Files:** `docs/design/redesign/{RESEARCH.md,PLAN.md,PROGRESS.md}`
- **Commit:** `fe95949` `docs(redesign): phase 0 research, plan and progress for storefront overhaul`
- **Decisions not obvious from the diff:**
  - Design thesis is **The Corridor** (PLAN §1). Orange is reserved for buyer-helpful
    attention only; the spring easing is the single expressive curve.
  - Dark theme ships in Phase 1 as `[data-theme="dark"]` opt-in; `prefers-color-scheme`
    auto-activation is deferred to the end of Phase 4 (PLAN §2.1).
  - Header nav is a visible category bar + flyout, not a hover mega-menu (PLAN Phase 2).
  - Product-grid skeletons pulled forward into Phase 3.
  - Research budget: 13 lookups used; RESEARCH.md is complete, do not add lookups.
- **Environment notes:** `obsidian` MCP was down this session (not needed for this effort).
  Preview configs exist in `.claude/launch.json` (`web (Angular SSR dev server)` :4200,
  `api (NestJS, watch mode)` :3000). Bash heredocs with `<<'EOF'` failed under this shell;
  use the Write tool for multi-line files.

## Phase 1 — Token foundation — DONE (2026-09-05)
- **Phase 0 commit:** `fe95949`. **Phase 1 commit:** recorded at the top of the Phase 2 entry.
- **Files:**
  - `apps/web/src/styles.scss` — `:root` rewritten to the full token set (colour tints/shades,
    semantic aliases with `on-`/`-container` pairs, focus ring, spacing 1–12, radius xs–xl,
    elevation 0–4, motion, z-index, layout, nine type steps); global reduced-motion rule
    zeroes the four duration tokens; `hb-dark-tokens` mixin applied under
    `:root[data-theme='dark']`; the `prefers-color-scheme` block is present but commented out
    behind the `PHASE-4 FLAG` comment. Every existing Material override kept verbatim.
  - `apps/web/src/styles/_tokens.scss` — new. `$breakpoints` map, `bp($name, up|down|only)`,
    `container(content|wide|max)`, `elevation($level)` function + mixin, `type($step)` mixin
    with per-step line-height/weight/tracking defaults.
  - `apps/web/angular.json` — `stylePreprocessorOptions.includePaths: ["src/styles"]` on the
    build target only (see decisions).
  - `apps/web/src/app/shared/components/radial-nav/radial-nav.scss` — `@use 'tokens' as t`
    (proves the include path), motion tokens, `t.bp(md)` for the desktop hide.
  - 31 component stylesheets — mechanical migration of the off-scale font sizes (130
    declarations, not the ~80 PLAN estimated) to `var(--hb-text-*)` per the PLAN map.
  - `docs/design/DESIGN.md` — token tables rewritten (thesis, where tokens live, colour ×3,
    type scale with legacy mapping, spacing, radius, elevation, motion, z-index, layout, dark).
  - `docs/design/redesign/evidence/capture.mjs` — new, reusable. Headless Chrome over CDP
    (no Playwright in the repo); captures each route at 360/768/1280/1440/1920 × light/dark
    and asserts no horizontal overflow. `node docs/design/redesign/evidence/capture.mjs
    phase-N home discover cart …` (routes without leading slash — see environment notes).
  - `docs/design/redesign/evidence/phase-1/` — curated six of the 50 captures (home
    360/1280/1920 light, home 1280 dark, discover 1280 light, login 1280 dark). The full set
    is 11 MB; regenerate with the command above rather than committing it.
- **Verification:** `npm run build -w @hb/web` clean (six pre-existing component-style budget
  *warnings*; `admin-users.scss` newly tips 1 byte over the 8 kB warn line because
  `var(--hb-text-sm)` is longer than `13px` — harmless, collapses when that file is
  tokenised properly). `npm run test -w @hb/web`: 80 files / 1134 tests pass, which also proves
  the include path resolves under the `unit-test` builder. DoD grep over `apps/web/src` for the
  ten legacy sizes returns 0. Live check at 1280: `--hb-*` resolve, radial FAB icon renders at
  30.4px (was 30px) with `cubic-bezier(0.34,1.56,0.64,1)`; `data-theme='dark'` switches body
  to `#111412` / `#e6e3e1`, primary `#66bb6a`, shadow tint `#000`. All 50 captures:
  `scrollWidth <= innerWidth`.
- **Decisions not obvious from the diff:**
  - `--hb-shadow-color` indirection: elevation shadows tint from it rather than directly from
    `--hb-on-surface`, so the dark theme can set it to true black. A light on-surface tint
    on dark cards reads as a halo, which is the opposite of "survives the dark theme".
  - `--hb-secondary-700: #b34700` is *the* AA-safe orange for text (5.5:1 on white);
    `--hb-sale`, `--hb-low-stock` and `--hb-warning` alias it. `--hb-secondary` stays fills-only.
  - `--hb-success` aliases `--hb-primary` (green is "go"); their container pair reuses the
    existing `.status-ok` colours (`#e6f4e1` / `#0c4a00`).
  - Include path is set on `build` only. `@angular/build:unit-test` has no
    `stylePreprocessorOptions` of its own; it inherits from `buildTarget`. Tests passing with
    radial-nav's `@use 'tokens'` confirms this. PLAN said "build and test" — amended in practice.
  - Sass map keys `'2xl'`/`'3xl'` must be quoted (unquoted `2xl` parses as number 2 with unit
    `xl`). Documented at the top of `_tokens.scss`.
  - Radial-nav durations snapped to the scale (0.45–0.55s → `slower` 520ms, 0.3–0.35s →
    `slow` 320ms, 0.2s → `base`). Its reduced-motion fade keeps a literal `0.2s` on purpose
    because the global rule zeroes the tokens.
  - `color-scheme: light|dark` set alongside the tokens so native form controls and
    scrollbars follow the theme.
  - Fluid steps: `3xl clamp(28px, 1.5rem + 0.5vw, 32px)`, `4xl clamp(36px, 2rem + 1vw, 48px)`,
    `display clamp(44px, 2rem + 2.5vw, 72px)`. Hits the bottom at ≤360 and the top at ≈1600.
  - `--hb-focus-ring` is a double ring (`surface` gap + `primary`) defined but **not yet
    applied globally** — a site-wide `:focus-visible` rule would change appearance, which
    Phase 1 promised not to do. Apply it in Phase 2 with the shell work.
  - Hard-coded colours in components (hero gradient, snackbars, `.status-error`, etc.) were
    deliberately left alone; they are Phase 4's grep target before the dark flag flips.
- **Environment notes:**
  - Docker daemon was down (Rancher Desktop not running), so no Postgres/API: storefront
    screens rendered their empty/error states and `/cart` redirected to `/login` (the
    `cart-*` captures are login screens). Fine for a token-only phase; Phase 2's
    `GET /categories` check needs the stack up (`preview_start` `db (postgres)` then
    `api (NestJS, watch mode)`), or read the seed/entity for `parentId` in `apps/api` instead.
  - Git Bash converts a leading-slash argument (`/discover`) into `C:/Program Files/Git/discover`
    before Node sees it. `capture.mjs` strips that, but pass routes as `home discover cart`.
  - A `cd` inside one Bash call persisted into the next calls this session; use absolute
    paths or a single `cd … && …` chain.
  - `obsidian` and `trello` MCPs both failed to connect this session; neither was needed.
  - Node 24 is installed (global `WebSocket`, so the CDP script needs no dependency).

## Phase 2 — Desktop nav + shell — DONE (2026-09-05)
- **Phase 1 commit:** `aeba0b5`. **Phase 2 commit:** recorded at the top of the Phase 3 entry.
- **Taxonomy check:** `GET /api/categories` returns the four seed categories, all without
  `parentId` (the entity supports it; nothing sets it). The flyout groups under parents when
  present and renders a flat four-column grid otherwise — the flat path is what ships.
- **Files:**
  - `apps/web/src/app/layout/category-nav/{category-nav.ts,.html,.scss,.spec.ts,
    category-nav.store.ts}` — new. Bar + trigger (≥1024), chip strip via `<app-category-chips>`
    (768–1023), flyout with hover intent (400ms), leave grace (200ms), Escape → focus back to
    trigger, Tab trap, arc `clip-path` reveal on `--hb-ease-spring` (fade under reduced
    motion), scrim at `z-index: -1` inside the header's stacking context. Root-provided store =
    one `GET /categories` per app lifetime; SSR response rides the hydration transfer cache
    (client made 0 category fetches on load). Renders nothing until the list is non-empty.
  - `apps/web/src/app/layout/nav-bar/{nav-bar.html,.scss,.ts,.spec.ts}` — header search
    (`<app-search-bar variant="header">`, ≥768, → `/discover?q=`), the old search icon button
    removed, `<app-category-nav />` as row two, sticky at `--hb-z-header`, `container(wide)`,
    compact state (scroll-driven CSS over 0–80px, IntersectionObserver sentinel fallback
    toggling `.nav-bar--compact`), wordmark 24px moved from 768 → 1024, every literal
    colour/size/duration in the file on tokens, account scrim/menu on the `-1` / dropdown
    z-index pattern.
  - `apps/web/src/app/shared/components/search-bar/{search-bar.ts,.html,.scss}` — `variant`
    input (`default | header`), header pill styles, panel z-index → `--hb-z-dropdown`.
  - `apps/web/src/app/layout/footer/footer.scss` — `container(wide)`, 768/1024/1440 tiers
    (1440: `1.6fr 1fr 1fr 1fr`, wider gaps and block padding).
  - `apps/web/src/styles.scss` — `@use 'tokens'`; global `:focus-visible` ring via `:where()`
    (transparent outline for forced colours; text fields excluded — their wrappers use
    `:focus-within`); `.hb-container`, `--wide`, `--max` utilities.
  - `apps/web/src/app/shared/components/radial-nav/radial-nav.scss` — `z-index: 60` →
    `--hb-z-scrim` so its open-state blur covers the new 200-level header.
  - Container migration (13 `max-width: 1280px` sites): `cart`, `checkout`, `wishlist` →
    `container(content)`; `discover`, `vendor-profile`, shop `.section` / `.hero__content` /
    `.newsletter__inner` → `container(wide)`; shop `.vendors-section` → gutter margins with
    `calc(wide − 2·gutter)` cap and auto margins from 1536px; `trust-banner` grid and the PDP
    (`.pdp`, sticky bar) → bare `var(--hb-container-…)` because their gutters live elsewhere.
    Measured at 1920: header, category row, hero copy, sections, trust grid, newsletter and
    footer all sit at 232–1672px; the vendors box at 280–1624px (the cap, centred).
  - Specs: `nav-bar.spec.ts` (search submit/trim/empty, category-nav mounted, compact toggle
    through a stubbed IntersectionObserver with `CSS` stubbed absent); `category-nav.spec.ts`
    (15 cases: ordering, `BAR_LIMIT`, chips → router, aria, flat panel, grouping + orphan
    promotion, Escape/focus, scrim, link click, Tab wrap, hover intent, leave grace);
    `shop`/`cart`/`wishlist` specs stub `CategoryNavStore` (they pin their page's single
    request with `expectOne`/`verify()`); `shop`/`discover` placeholder tests scoped to the
    page's own search input.
  - `docs/design/DESIGN.md` — container usage per surface + new "Shell (Phase 2)" section.
    `docs/design/redesign/PLAN.md` — Amendments 1–7 (2026-09-05) and cards 7–8 in §5.
  - `docs/design/redesign/evidence/capture.mjs` — routes accept a `!flyout` modifier
    (`discover!flyout`) that clicks the trigger before capture; the slug gains `-flyout`.
  - `docs/design/redesign/evidence/phase-2/` — curated six of 50: `home-1280-light`
    (header IA), `home-768-light` (search + chip tier), `home-1920-light` (1440 containers,
    footer tier), `discover-flyout-1280-{light,dark}`, `discover-768-light` (documents the
    pre-existing grid overflow below).
- **Verification:** `npm run build -w @hb/web` clean (the six pre-existing budget warnings plus
  `nav-bar.scss` now 8.43 kB against the 8 kB *warn* line — comments; harmless).
  `npm run test -w @hb/web`: 81 files, all passing (1152 tests). Live at 1280: bar links,
  trigger `aria-expanded`, focus lands on the first panel link, animation
  `category-nav-reveal 0.52s cubic-bezier(0.34,1.56,0.64,1)`, panel z 300 / header z 200,
  Escape closes and refocuses the trigger, `scrollWidth <= innerWidth`. Dark: header
  `#111412`, link `#bfcab7`, primary `#66bb6a`. Headless-Chrome probe (real viewport, see
  environment notes): scroll-driven path gives padding 12px / logo 54px at 40px of scroll and
  8px / 44px past 80px, back to 16 / 64 at 0; with `CSS.supports` stubbed false the observer
  toggles `.nav-bar--compact` on/off. Captures: 46 of 50 clean; the four `discover-768-*`
  overflow at 1223 > 768.
- **Known defect, pre-existing, fixed in Phase 3:** `/discover` overflows at 768px because
  `.discover__grid` goes to `repeat(4, 1fr)` at ≥768 while `product-card.scss` keeps a fixed
  `width: 280px` — neither file's grid/width rules changed here (`git diff` on the card is
  empty), and Phase 1 only captured `/discover` at 1280. PLAN Phase 3's fluid card
  (`width: 100%`, grid owns the columns) is the fix; do it there, not as a Phase 2 patch.
- **Decisions not obvious from the diff:** see PLAN Amendments 1–7. In short: no search icon
  below 768 (pre-launch row-width decision stands); sentinel outside the sticky header;
  PDP keeps literal gutters until Phase 5; query params from `Router.routerState.root`;
  `CategoryNavStore` rather than a `CategoriesService` change; radial nav lifted to the scrim
  level; active nav link is green, not orange (orange stays buyer-attention only).
  Two more: `BAR_LIMIT` is 8 (PLAN said 6–8; with four seed categories it is moot, the cap
  protects the row when the taxonomy grows); the "Browse all products" pill in the panel uses
  `--hb-primary-50/700` so it reads as a quiet secondary action, not a CTA.
- **Environment notes:**
  - Rancher Desktop was off; `rdctl start` (not on PATH — full path in memory) brought the
    daemon up in ~1 min and the `db` + `meilisearch` containers restarted on their own.
    `preview_start db (postgres)` then reports port 5432 "in use" by `host-switch.exe` —
    that is the healthy state. API routes are under `/api` (`curl :3000/api/categories`).
  - The Browser pane's viewport emulation is unreliable for scroll-driven animations (the
    ScrollTimeline reported 0 progress at scrollY 500, and with emulation cleared the tab
    reported a 0×0 viewport). Verify such things with a headless-Chrome CDP probe (same
    plumbing as `capture.mjs`); the pane is fine for structure, clicks and computed colours.
  - The DOM test environment has no `CSS` global — stub it (`vi.stubGlobal`) rather than
    spying on it. Git Bash rewrites a leading-slash script argument (`/discover`) — pass
    routes without the slash, as `capture.mjs` documents.
  - `obsidian` MCP failed to connect again; not needed. `trello` connected but unused.

## Phase 3 — Storefront + product card — DONE (2026-09-05)
- **Phase 2 commit:** `51a87df`. **Phase 3 commit:** recorded at the top of the Phase 4 entry.
- **Data check (the phase's first question):** `VendorDto` has **no** verified flag — `status`
  (`approved`) is the only trust signal, so the showcase badge reads "Approved" and card 3 in
  PLAN §5 stands. All ten seed products return `images: []`, every one is in stock, none is
  sized, and four of the six directory vendors have listings. So the card's image, hover
  cross-fade, low-stock, sold-out, rating and sale paths are all **unexercised by seed data** —
  they are covered by unit tests instead (see below), and photography is now PLAN §5 card 9.
- **Files:**
  - `apps/web/src/app/shared/components/skeleton/{skeleton.ts,.scss,.spec.ts}` — new. The
    primitive: `rect|text|circle`, host-bound class/width/height, `aria-hidden`, token-only
    shimmer on `--hb-duration-slower × 3` (still under reduced motion, since a 0s animation
    paints its first frame).
  - `apps/web/src/app/shared/components/product-card/{product-card-skeleton.ts,.scss}` — new.
    Inline template composing `<app-skeleton>` into the card's exact box.
  - `apps/web/src/app/shared/components/product-card/{product-card.ts,.html,.scss,.spec.ts}` —
    fluid (`width: 100%`, `height: 100%`, `:host { display: block }`); seller line + origin
    chip; stock state; rating and sale slots; `images[1]` hover cross-fade; hover elevation
    lift; quick-add revealed on hover/focus only under `(hover: hover) and (pointer: fine)`;
    900ms spring + check on add, spring pop on wishlist; both timers cleared via `DestroyRef`.
    `ProductCardProduct = ProductDto & Partial<ProductListingExtras>` is the local widening.
  - `apps/web/src/styles.scss` — `.hb-product-grid` and `.hb-waypoint` utilities; four hero
    tokens in `:root` plus `--hb-hero-surface` under the dark mixin.
  - `apps/web/src/app/features/shop/{shop.html,.scss,.ts}` — hero (`<picture>`, WebP-first,
    `fetchpriority="high"`, 7/5 split from 1280), waypoint section titles, carousel as a
    column-flow grid with snap, category route tiles, vendor + carousel skeletons, newsletter
    rebuilt as a bordered band. `deriveVendorListingCounts` added next to `deriveCategoryCounts`.
  - `apps/web/src/app/shared/components/trust-banner/*` — `variant="strip|cards"`; the strip is
    the four waypoints on a route line; `<ol>` because the waypoints are ordered.
  - `apps/web/src/app/shared/components/vendor-showcase/*` — seller identity; stars removed;
    `listingCounts` input; logo support; initials skip punctuation.
  - `apps/web/src/app/features/services/services.html` — pinned to `variant="cards"`.
  - `discover`, `vendor-profile`, `product-detail`, `wishlist` — grids take `.hb-product-grid`,
    `hourglass_top` states swapped for skeletons behind `role="status"` + `aria-busy`.
  - `docs/design/DESIGN.md` — new "Storefront and product presentation (Phase 3)" section.
    `docs/design/redesign/PLAN.md` — Amendments 1–9 (Phase 3) and §5 cards 9–11.
  - `docs/design/redesign/evidence/capture.mjs` — `!loading` modifier (see environment notes).
  - `docs/design/redesign/evidence/phase-3/` — curated eight of 80.
- **Verification:** `npm run build -w @hb/web` clean (nine pre-existing budget *warnings*;
  `product-card.scss` joins them at 8.43 kB and `shop.scss` at 11.98 kB — comments, harmless).
  `npm run test -w @hb/web`: 82 files, 1179 tests, all passing — up from Phase 2's 81 / 1152
  (product-card 37, of which 19 are new; skeleton 2; trust-banner 7; vendor-showcase 8;
  shop 28, +2 for `deriveVendorListingCounts`).
  Live at 1280: `.hb-product-grid` resolves to five 214.6px columns; card 215px wide; the
  quick-add is `opacity: 0` at rest with `(hover: hover)` matching, and the hovered card alone
  shows it (screenshot); hero copy 48–707px and picture 747–1217px with the scrim `display:
  none` — the 7/5 split; the hero loads `hero-import-shopping-640.webp`, not the 1536. Dark at
  1280: hero `#10301a`, card `#0c0f0d`, strip `#191d1a`, name `#e6e3e1`. Captures: **all 60
  route captures plus all 20 loading captures free of horizontal overflow**, which closes the
  `/discover` 768px defect Phase 2 recorded (was 1223 > 768).
- **Decisions not obvious from the diff:** see PLAN Amendments 1–9 (Phase 3). In short: the
  grid minimum is 200px and only applies from 768 (a 220px minimum collapses a 360px phone to
  one column); the trust strip and vendor showcase became *variants* rather than new
  components so the Procurement Service page keeps the copy it was written for; the fake
  five-star vendor rating was deleted rather than restyled; four hero tokens exist because the
  tint ladders re-order in dark mode; card stock sums `sizes[].stockQuantity`, since
  `stockQuantity` is meaningless on sized rows and reading it alone would show "Sold out" on
  every sized product; category counts fall back to "Browse" at zero.
- **Environment notes:**
  - **The Angular dev server served a stale client bundle after these edits.** The SSR HTML at
    `/shop` had the new template while the browser rendered the old hero *with* the new trust
    strip — a half-applied HMR state that also poisoned the headless captures. Neither a
    cache-busting query nor a fresh Chrome profile helped. `preview_stop` + `preview_start` on
    `web (Angular SSR dev server)` fixed it. **Restart the dev server before trusting any
    capture that looks stale**, and check `preview_logs` for the compile errors that preceded
    it (a template referencing a field that does not exist yet leaves the server serving the
    last good client bundle while SSR moves on).
  - `capture.mjs`'s `!loading` cannot work by blocking the API and reloading — SSR fetches
    server-side, so the HTML arrives populated. It seeds `/discover`, holds
    `*/api/products*` and `*/api/vendors/directory*` open with CDP `Fetch` (never continued),
    then enters the target route by *client-side* navigation (`a.nav-bar__brand` for `/`, a
    category chip for `/discover`) and refuses to capture unless a skeleton is on the page.
  - Reading `getComputedStyle(...).opacity` over CDP on a `:hover`-revealed element reported
    the *unhovered* value while the screenshot showed it revealed. Trust the screenshot;
    computed style over CDP is unreliable for hover-dependent properties.
  - `npx vitest run <path>` from `apps/web` fails to collect ("no tests"); use
    `npm run test -w @hb/web -- --include='**/<name>.spec.ts'` from the repo root instead.
  - Bash heredocs into `python -` still fail under this shell (Phase 0's note); `cat >> file
    << 'EOF'` works fine, and a script written to the scratchpad then executed works for Python.
  - The API takes ~90s to become reachable after `preview_start` even when it reports
    "reused"; poll `curl localhost:3000/api/categories` rather than assuming it is up.
  - `obsidian` MCP failed to connect again; `trello` timed out this session. Neither was needed.

## Phase 4 — Trust, states, perceived performance — DONE (2026-09-06)
- **Phase 3 commit:** `c4e5b2f` (`2f459fe` was the code; `c4e5b2f` the guardrail-log entry).
  **Phase 4 commit:** `542e7c6`.
- **Files:**
  - `apps/web/src/app/shared/components/state-message/{state-message.ts,.html,.scss,.spec.ts}`
    — new. `kind="loading|empty|error"` decides glyph-vs-spinner, `role`, `aria-live` and
    `aria-busy` once. **The action slot is mandatory for empty and error**: project with the
    `stateAction` attribute, and in dev mode an empty slot logs a warning naming the message.
    `requireAction="false"` is the one deliberate opt-out (the PDP reviews panel).
  - `apps/web/src/styles.scss` — global `.visually-hidden` (hoisted from five byte-identical
    component copies), `.hb-spinner` + `hb-spin` (hoisted out of `state-message.scss`; four
    consumers), `.state-message__btn` / `__link`, `.auth-panel .state-icon--busy`,
    `--hb-primary-700` documented as the AA-safe green for text, and **the
    `prefers-color-scheme: dark` block uncommented** — the phase's headline change.
  - `shared/components/trust-banner/*` — third variant `inline` (short labels, transparent
    ground, no route line) plus an optional `short` field on `TrustBannerItem`. Placed on
    `/discover` (under the filters), the PDP (under the price), the cart summary and the
    checkout security block.
  - `features/discover/*` — states → `<app-state-message>` with retry / clear-filters;
    `refreshing` signal + `.discover__grid--refreshing` fade-through; `buildQuery()` extracted
    so `retryProducts()` re-issues the same query; inline trust ribbon; logistics-banner
    colours tokenised.
  - `features/shop/*` — three state pairs → `<app-state-message>`; `retryProducts/Categories/
    Vendors` (each section retries only its own request); local `.state-message` and
    `.visually-hidden` blocks deleted.
  - `features/product-detail/*` — loading → a layout-shaped skeleton (square hero, title,
    price, size chips, shipping card, CTA); reviews loading → three skeleton rows; not-found /
    error / reviews states → `<app-state-message>` with `retryProduct()` / `retryReviews()`;
    inline trust ribbon under the price; `#pdp-review-form` anchor; three raw colours tokenised.
  - `features/cart/*` — skeleton rows while loading, error → state message with retry,
    landed-cost rows (`dutyLabel()` + "Calculated at checkout"), trust ribbon above the CTA.
  - `features/checkout/*` — two-column skeleton, error → state message with retry + back-to-cart,
    `.checkout__security` payment-security block, landed-cost rows between the subtotal and the
    shipping/total block, ten raw colours tokenised.
  - `features/wishlist/*` — error → state message with retry (the empty state kept its bespoke
    card, see decisions).
  - `auth/callback`, `auth/verify-email`, `vendor/onboarding` — the three genuinely in-flight
    `hourglass_top` glyphs became `.hb-spinner`; vendor-onboarding's other two stayed (see
    decisions). `vendor-onboarding.scss`'s eleven raw colours tokenised.
  - Mechanical token sweep across 12 more stylesheets (`0 1px 2px rgba(28,27,27,…)` →
    `--hb-elevation-1`, `0 0 0 2px rgba(46,125,50,.1)` → `color-mix` on `--hb-primary`, etc.).
  - `docs/design/redesign/evidence/capture.mjs` — `!auth` (login + seed a cart item, so
    `/cart` and `/checkout` capture the real screens instead of `/login`), `!refreshing`,
    `!security`; both themes now pinned via `data-theme`; `Network.setCacheDisabled`;
    the `!loading` entry for `/discover` rewritten (see environment notes).
  - `docs/design/DESIGN.md` — new "States, trust and perceived performance (Phase 4)" section;
    `--hb-primary-700` and the dark-theme section rewritten.
    `docs/design/redesign/PLAN.md` — Amendments 1–10 (Phase 4) and §5 cards 12–14.
  - `docs/design/redesign/evidence/phase-4/` — curated nine of 80.
- **Verification:** `npm run build -w @hb/web` clean (the nine pre-existing budget *warnings*;
  `shop.scss` fell 11.98 → 11.45 kB and `product-card.scss` 8.43 → 8.29 kB as the duplicated
  blocks left). `npm run test -w @hb/web`: **83 files, 1204 tests, all passing** — up from
  Phase 3's 82 / 1179 (state-message 6 new, trust-banner +3, discover +4, cart +5, checkout +3,
  PDP +3, vendor-profile +1).
  **Contrast audit** (headless CDP, every text node on `/`, `/discover`, the PDP, `/cart`,
  `/checkout`, `/wishlist` × light and dark, decorative `aria-hidden` glyphs and disabled
  controls excluded per WCAG 1.4.3): three genuine failures found and fixed (see decisions),
  then **all twelve route/theme combinations clean**. Captures: **all 80 free of horizontal
  overflow** (70 route captures + 10 `!security`), and `!refreshing` asserted a dimmed grid
  with *no* skeletons on the page at every width, which is the fade-through proved live.
  `.hb-spinner` measured on a live page: 40px, `hb-spin` 0.9s linear, primary top border.
- **Decisions not obvious from the diff:** see PLAN Amendments 1–10 (Phase 4). In short:
  the trust strip landed as an `inline` **variant**, not the full band, because at those four
  points it would push the product/price/totals below the fold; there are no payment provider
  names to show (`PaymentDto.provider` is `'stub'`), so the security block states only what is
  true today; the duty amount is formatted from the cart's own currency, never hard-coded to
  rand; the checkout stepper micro-interaction is deferred to Phase 5, which is where the
  stepper is introduced; three of the four `hourglass_top` templates took a *spinner*, not a
  skeleton, because they have no content shape to preview, and two of vendor-onboarding's
  hourglasses stayed because they mark a genuinely *pending* application; the wishlist's empty
  state kept its bespoke filled CTA. Two more:
  - **`--hb-primary` fails AA as text on a card.** The audit measured 4.41:1 on
    `--hb-surface-container` (it is 5.13 on white and 4.89 on the page ground). The checkout
    total, the checkout line totals and the PDP's "Simplified Customs Included" fact moved to
    `--hb-primary-700`, now documented as the AA-safe green — the mirror of `--hb-secondary-700`.
  - **Two colours stay literal on purpose** and must not be tokenised: WhatsApp's brand green
    on `/contact` (a third party's brand does not re-theme) and the radial nav's glass palette,
    which paints its own scrim. A raw-hex grep over `apps/web/src/**/*.scss` should return
    only those two; that is the check before touching the dark theme again.
- **Environment notes:**
  - **The dev server serves stale *component styles* after an edit, and CDP cache-disabling
    does not cure it.** A SCSS change compiled correctly into the served chunk (verified by
    `curl`ing the chunk), yet both the Browser pane and a fresh headless Chrome kept computing
    the *old* colour — through a hard reload and with `Network.setCacheDisabled`. Only
    `preview_stop` + `preview_start` fixed it. This cost ~20 minutes: **restart the dev server
    before trusting any style verification**, and confirm a fix by computed style, not by
    grepping the source.
  - `capture.mjs`'s light pass silently went dark the moment the media query was live: deleting
    `data-theme` no longer means "light", it means "whatever the host OS is set to". Both
    themes are now pinned. Anything else that toggles themes needs the same treatment.
  - The `!loading` entry for `/discover` used to click a category chip in-page; with the
    fade-through that no longer produces skeletons (correctly). It now leaves via the brand
    link and returns through a storefront category tile.
  - Guarded routes need `!auth`, which reads `HB_CAPTURE_EMAIL` / `HB_CAPTURE_PASSWORD` from
    the environment — deliberately not hard-coded. For a locally seeded database the dev
    credential is the one `apps/api/src/database/seed.ts` prints when it runs.
  - The API runs in watch mode and restarts on its own (a `File change detected` in
    `preview_logs`); `curl localhost:3000/api/categories` returns `000` for ~30s while it does.
  - `.chrome-profile/` inside each `evidence/phase-N/` is ~95 MB and is gitignored — do not be
    alarmed by `du` on that directory.
  - `obsidian` MCP failed to connect again; `trello` connected but was not needed.

## Phase 5 — PDP, cart, checkout — TODO
- **Next action:** follow PLAN Phase 5, starting with the PDP gallery + sticky buy box at
  `≥1280`. Read PLAN Amendment 3 (Phase 2) first: the PDP still carries its own literal
  16/40px gutters instead of the container mixin, and Phase 5 is where that is meant to be
  reworked. Two Phase 4 threads land here too: the **route-strip stepper** carries the
  "waypoint fills as the step advances" micro-interaction that Phase 4 deferred (PLAN
  Amendment 4), and the checkout's `submitting` state is the natural first consumer for
  `<app-state-message kind="loading">`, which currently ships tested but unused (§5 card 14).
  Start the dev server *fresh*, and re-run the contrast audit after any colour change —
  the recipe is in the Phase 4 verification note above.

## Phase 6 — Follow-up cards — TODO
- **Next action:** review PLAN §5, add anything exposed in Phases 1–5, and (if Trello MCP is
  up) create the cards on the board; record card IDs here.
