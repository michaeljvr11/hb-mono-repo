# PROGRESS — HB Storefront Overhaul

> **This file is the truth.** On session start: find the first phase not `DONE`, read its
> "Next action", continue from exactly there. Do not re-research, re-plan or re-audit.
> Branch: `feat/storefront-visual-overhaul`. Never merge to `main`.

| Phase | Status |
|---|---|
| 0 Orient, research, plan | DONE |
| 1 Token foundation | DONE |
| 2 Desktop nav + shell | DONE |
| 3 Storefront + product card | TODO |
| 4 Trust, states, perceived performance | TODO |
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

## Phase 3 — Storefront + product card — TODO
- **Next action:** check `VendorDto` for a verified flag and `images.length` on seed data,
  then follow PLAN Phase 3. Make the product card fluid *first* — it also closes the
  pre-existing `/discover` overflow at 768 recorded above (re-run
  `node docs/design/redesign/evidence/capture.mjs phase-3 discover` and expect `no` at 768).
  Stack: `rdctl start` if `docker ps` fails, then `preview_start` `api (NestJS, watch mode)`
  and `web (Angular SSR dev server)`; a product id for PDP captures comes from
  `curl localhost:3000/api/products?limit=1`.

## Phase 4 — Trust, states, perceived performance — TODO
- **Next action:** `grep -rl hourglass_top apps/web/src --include=*.html` for the remaining
  templates; follow PLAN Phase 4. Before flipping the dark flag, grep the funnel files for raw
  hex/rgba (Phase 1 left them all in place).

## Phase 5 — PDP, cart, checkout — TODO
- **Next action:** follow PLAN Phase 5.

## Phase 6 — Follow-up cards — TODO
- **Next action:** review PLAN §5, add anything exposed in Phases 1–5, and (if Trello MCP is
  up) create the cards on the board; record card IDs here.
