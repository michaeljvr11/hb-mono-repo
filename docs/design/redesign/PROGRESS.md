# PROGRESS — HB Storefront Overhaul

> **This file is the truth.** On session start: find the first phase not `DONE`, read its
> "Next action", continue from exactly there. Do not re-research, re-plan or re-audit.
> Branch: `feat/storefront-visual-overhaul`. Never merge to `main`.

| Phase | Status |
|---|---|
| 0 Orient, research, plan | DONE |
| 1 Token foundation | DONE |
| 2 Desktop nav + shell | TODO |
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

## Phase 2 — Desktop nav + shell — TODO
- **Next action:** bring the stack up (`preview_start` → `db (postgres)`, then
  `api (NestJS, watch mode)`, then `web`) and hit `GET /categories` to see whether any
  category has a `parentId`; if Docker is still down, read the categories entity + seed in
  `apps/api` instead. Then follow PLAN Phase 2. Also apply `--hb-focus-ring` on
  `:focus-visible` as part of the shell work (deferred from Phase 1, see above).

## Phase 3 — Storefront + product card — TODO
- **Next action:** check `VendorDto` for a verified flag and `images.length` on seed data,
  then follow PLAN Phase 3.

## Phase 4 — Trust, states, perceived performance — TODO
- **Next action:** `grep -rl hourglass_top apps/web/src --include=*.html` for the remaining
  templates; follow PLAN Phase 4. Before flipping the dark flag, grep the funnel files for raw
  hex/rgba (Phase 1 left them all in place).

## Phase 5 — PDP, cart, checkout — TODO
- **Next action:** follow PLAN Phase 5.

## Phase 6 — Follow-up cards — TODO
- **Next action:** review PLAN §5, add anything exposed in Phases 1–5, and (if Trello MCP is
  up) create the cards on the board; record card IDs here.
