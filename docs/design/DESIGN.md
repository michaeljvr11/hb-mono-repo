# HB Design System — Source of Truth

> **STATUS: Source of truth is Claude Design (claude.ai/design).** Migrated from the Stitch
> "Trans-Frontier Commerce System" design system on 2026-06-18; all seven screens are pulled.
> Tokens below are canonical and mirrored in the `claude-design/` sync bundle. Screens not yet
> implemented fall back to these tokens + Angular Material 21 defaults; do not invent values
> outside this palette.
>
> **2026-09-05 — token foundation rewritten** as Phase 1 of the storefront overhaul
> (`docs/design/redesign/PLAN.md`). The 17 original colours are unchanged; everything else on
> this page (tints, semantic aliases, spacing, radius, elevation, motion, z-index, layout, the
> nine-step type scale and the dark theme) is new and lives in `apps/web/src/styles.scss`.

## How this directory works

```
docs/design/
├── DESIGN.md          ← this file: tokens (colors, typography, spacing, components)
├── redesign/          ← the storefront overhaul: BRIEF, RESEARCH, PLAN, PROGRESS (live state)
├── claude-design/     ← Claude Design sync bundle (pushed to claude.ai/design via DesignSync)
└── <screen>/          ← one folder per screen, e.g. product-detail/
    ├── export.html    ← HTML + Tailwind export (mirrored from Claude Design)
    └── reference.png  ← screenshot of the design
```

The `design-to-code` agent reads all three and produces Angular standalone components.
Tokens in this file are **canonical** — exported HTML is reference material, not truth.

**Agent workflow for a new screen:**
1. Sync the screen from the Claude Design project via the `/design-sync` skill (`DesignSync` tool)
2. Mirror the export + screenshot to `docs/design/<screen>/export.html` + `reference.png`
3. Update token tables in this file if the design introduces new values
4. Invoke the `design-to-code` agent with the export path; it handles Angular conversion

## Design thesis — The Corridor

HB is the road from Johannesburg and Cape Town to Windhoek: the route, the handover, the
arrival. Full statement in `redesign/PLAN.md` §1. The rules that fall out of it and bind every
component:

- **Green is the land and "go"; orange is the desert sun.** Orange (`--hb-secondary` family)
  is reserved for *attention that helps the buyer* — the sale price, the low-stock state, the
  active waypoint. Never decoration.
- **One spring.** `--hb-ease-spring` is the only expressive easing on the site, used at
  high-intent moments (add-to-cart, wishlist, filter apply, step advance, flyout reveal).
  Everything else uses `--hb-ease-decelerate` or `--hb-ease-standard`.
- **Geometry: arcs and waypoints.** Section dividers, the route strip, the stepper and the
  flyout reveal all use the same motif.
- **Type is infrastructure, not boutique.** Inter only. Headlines tight and heavy (700/800),
  everything else calm (400/500). Price is the largest type on a card after the name.
- **Trust as content, not chrome.** Every moment of doubt gets an answer in the layout.

## Where the tokens live

| Layer | File | Use |
|---|---|---|
| CSS custom properties (`--hb-*`) | `apps/web/src/styles.scss` `:root` | Everything that can vary at runtime: colour, spacing, radius, elevation, motion, z-index, layout widths, type sizes. |
| SCSS helpers | `apps/web/src/styles/_tokens.scss` | Breakpoints (custom properties are not allowed inside `@media`) and mixins that bundle tokens: `bp()`, `container()`, `elevation()`, `type()`. |

Component stylesheets reach the SCSS helpers with `@use 'tokens' as t;` — no relative path,
resolved via `stylePreprocessorOptions.includePaths` in `apps/web/angular.json`.

```scss
@use 'tokens' as t;

.grid  { @include t.bp(lg) { grid-template-columns: repeat(4, 1fr); } }
.page  { @include t.container(wide); }
.card  { @include t.elevation(2); }
.title { @include t.type('3xl'); }
```

## Tokens (canonical)

### Colour — brand
Light values. Dark values in the [Dark theme](#dark-theme) section.

| Token | Light | Usage |
|---|---|---|
| `--hb-primary` | `#2e7d32` | Primary actions, links, focus ring, "go" |
| `--hb-primary-container` | `#43a047` | Lighter primary / hover accents (hand-picked, not Material-generated — see LSM-1) |
| `--hb-on-primary` | `#ffffff` | Text/icons on primary |
| `--hb-primary-50` | `#eef6ee` | Subtlest primary tint (selected row, soft chip) |
| `--hb-primary-100` | `#d9ecda` | Primary tint (chip fill, success wash) |
| `--hb-primary-200` | `#b3d9b5` | Primary tint (borders on tinted surfaces) |
| `--hb-primary-700` | `#256428` | Primary hover/pressed |
| `--hb-primary-800` | `#1b4d1e` | Primary text on tinted surfaces |
| `--hb-secondary` | `#f57c00` | Accent fills, bars, badge backgrounds — **fills only**, fails AA as a foreground (2.70:1 on light surfaces) |
| `--hb-secondary-fixed` | `#ffdcc7` | Soft accent fill (badges, status pills) |
| `--hb-on-secondary-container` | `#703500` | Text/icons on secondary-fixed (9.5:1 on white) |
| `--hb-secondary-50` | `#fff4ea` | Subtlest orange tint |
| `--hb-secondary-100` | `#ffe6d1` | Orange tint |
| `--hb-secondary-700` | `#b34700` | **The AA-safe orange for text** on light surfaces (5.5:1 on white). Use this, never `--hb-secondary`, for orange text or icons. |

### Colour — surfaces
| Token | Light | Usage |
|---|---|---|
| `--hb-background` | `#fcf9f8` | Page background |
| `--hb-surface` | `#fcf9f8` | App surface |
| `--hb-surface-container-lowest` | `#ffffff` | Cards, inputs |
| `--hb-surface-container-low` | `#f6f3f2` | Subtle hover fills |
| `--hb-surface-container` | `#f0eded` | Panels, trust-badge fill |
| `--hb-surface-container-high` | `#eae7e6` | Nested panels, table headers |
| `--hb-surface-container-highest` | `#e4e1e0` | Skeletons, pressed fills |
| `--hb-on-surface` | `#1c1b1b` | Body text / headings |
| `--hb-on-surface-variant` | `#404a3b` | Labels, secondary text |
| `--hb-outline` | `#707a6a` | Strong input borders |
| `--hb-outline-variant` | `#bfcab7` | Card + subtle borders, dividers |
| `--hb-scrim` | `rgba(0,0,0,0.35)` | Modal / drawer overlay scrim |

### Colour — semantic
Each role has four tokens: `--hb-<role>`, `--hb-on-<role>`, `--hb-<role>-container`,
`--hb-on-<role>-container`. Use the plain pair for solid fills and the container pair for
soft pills and banners.

| Role | `<role>` | `on-<role>` | `<role>-container` | `on-<role>-container` | Usage |
|---|---|---|---|---|---|
| `error` | `#ba1a1a` | `#ffffff` | `#ffdad6` | `#93000a` | Validation, failures |
| `success` | → primary | → on-primary | `#e6f4e1` | `#0c4a00` | Confirmations, "in stock" |
| `warning` | → secondary-700 | `#ffffff` | → secondary-fixed | → on-secondary-container | Caution |
| `info` | `#0b57a5` | `#ffffff` | `#dbe9ff` | `#0a2f5c` | Neutral notices |
| `sale` | → secondary-700 | `#ffffff` | → secondary-fixed | → on-secondary-container | Sale price, discount badge |
| `low-stock` | → secondary-700 | `#ffffff` | → secondary-fixed | → on-secondary-container | "Only N left" |

`sale` and `low-stock` are the two places orange is allowed as a foreground. Both alias the
AA-safe shade.

**Focus ring:** `--hb-focus-ring: 0 0 0 2px var(--hb-surface), 0 0 0 4px var(--hb-primary)` —
a double ring that reads on any fill. Apply as `box-shadow: var(--hb-focus-ring)` on
`:focus-visible`. (Legacy inputs still use border primary + `0 0 0 2px rgba(46,125,50,0.1)`;
migrate when touched.)

### Typography
Font family: `Inter` (400/500/600/700/800), system-ui fallback. Nine steps; the top three are
fluid (`clamp()`) so headlines scale with the viewport without breakpoints.

| Token | Size | Default line-height / weight / tracking (via `t.type()`) | Replaces |
|---|---|---|---|
| `--hb-text-xs` | 12px | 1.4 / 500 / 0.01em | `label-sm`; legacy 10, 11 |
| `--hb-text-sm` | 14px | 1.45 / 400 / 0 | `body-sm`, `label-lg`; legacy 13 |
| `--hb-text-md` | 16px | 1.5 / 400 / 0 | `body-md`; legacy 15 |
| `--hb-text-lg` | 18px | 1.5 / 400 / 0 | `body-lg` |
| `--hb-text-xl` | 20px | 1.4 / 500 / 0 | `title-lg`; legacy 22 |
| `--hb-text-2xl` | 24px | 1.3 / 600 / -0.01em | `headline-md`; legacy 26 |
| `--hb-text-3xl` | `clamp(28px, 1.5rem + 0.5vw, 32px)` | 1.2 / 700 / -0.01em | `headline-lg`, `headline-lg-mobile`; legacy 30 |
| `--hb-text-4xl` | `clamp(36px, 2rem + 1vw, 48px)` | 1.1 / 700 / -0.02em | `display-lg`; legacy 36, 40 |
| `--hb-text-display` | `clamp(44px, 2rem + 2.5vw, 72px)` | 1.05 / 800 / -0.025em | hero; legacy 56, 72 |

The legacy off-scale sizes (10, 11, 13, 15, 22, 26, 30, 36, 56, 72px) were migrated to the
tokens in Phase 1 and must not reappear: `grep -rE 'font-size: (1[0135]|2[26]|30|36|56|72)px'
apps/web/src` returns nothing. In-scale literals (12, 14, 16, 18, 20, 24, 28, 32, 40, 48px)
are migrated to the token as each component is touched.

Icons: **Material Symbols Outlined** (loaded in `apps/web/src/index.html`).

### Spacing
4px base, twelve steps. Prefer these over literals for gap, padding and margin.

| Token | `1` | `2` | `3` | `4` | `5` | `6` | `7` | `8` | `9` | `10` | `11` | `12` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `--hb-space-N` | 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 | 80 | 96 |

### Radius
| Token | Value | Usage |
|---|---|---|
| `--hb-radius-xs` | 4px | Tags, table cells, small chips |
| `--hb-radius-sm` | 8px | Buttons, inputs, standard cards |
| `--hb-radius-md` | 12px | Large cards, panels, modals |
| `--hb-radius-lg` | 16px | Hero panels, sheets |
| `--hb-radius-xl` | 24px | Feature tiles |
| `--hb-radius-pill` | 9999px | Pill/CTA buttons, circular badges, accent bars — not a global button override |

### Elevation
Five steps, each a two-layer shadow tinted from `--hb-shadow-color` (the on-surface colour in
light mode, true black in dark mode). Use `t.elevation(N)` or `box-shadow: var(--hb-elevation-N)`.

| Token | Usage |
|---|---|
| `--hb-elevation-0` | Flat (`none`) |
| `--hb-elevation-1` | Resting card, input |
| `--hb-elevation-2` | Hovered card, sticky bar |
| `--hb-elevation-3` | Dropdown, flyout, popover |
| `--hb-elevation-4` | Modal, drawer |

### Motion
| Token | Value | Usage |
|---|---|---|
| `--hb-duration-fast` | 120ms | Colour/opacity on hover, press feedback |
| `--hb-duration-base` | 200ms | Most transitions |
| `--hb-duration-slow` | 320ms | Reveals, fades of larger regions |
| `--hb-duration-slower` | 520ms | Spring moments, flyout reveal |
| `--hb-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default |
| `--hb-ease-decelerate` | `cubic-bezier(0.22, 1, 0.36, 1)` | Things entering / settling |
| `--hb-ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | **The one expressive curve.** High-intent moments only. |

`@media (prefers-reduced-motion: reduce)` sets every `--hb-duration-*` to `0ms` globally, so
anything built on the tokens collapses to an instant change. A component that wants a fade
to survive declares a literal duration for that one transition (see `radial-nav.scss`).

### Z-index
| Token | Value | Usage |
|---|---|---|
| `--hb-z-raised` | 1 | Lifted card, badge over image |
| `--hb-z-sticky` | 100 | Sticky sub-bars, buy box |
| `--hb-z-header` | 200 | Site header |
| `--hb-z-dropdown` | 300 | Flyouts, menus, popovers |
| `--hb-z-scrim` | 400 | Overlay scrim |
| `--hb-z-modal` | 500 | Modals, drawers |
| `--hb-z-toast` | 600 | Snackbars |

### Layout
| Token | Value | Usage |
|---|---|---|
| `--hb-container-content` | 1280px | Reading surfaces (PDP body, legal, marketing) |
| `--hb-container-wide` | 1440px | Product grids, header inner |
| `--hb-container-max` | 1680px | Page stops growing; margin carries it |
| `--hb-gutter` | `clamp(16px, 4vw, 48px)` | Horizontal page padding |

Breakpoints (SCSS only, mobile-first `min-width`, `t.bp(name)`): `sm` 480 · `md` 768 ·
`lg` 1024 · `xl` 1280 · `2xl` 1440 · `3xl` 1680. `t.bp(name, down)` and `t.bp(name, only)`
are available for the rare max-width case.

## Dark theme

Same hues, surfaces derived. Delivered under `<html data-theme="dark">` (opt-in). The
`prefers-color-scheme: dark` block exists in `styles.scss` but is commented out behind a
single flag until the storefront funnel carries no hard-coded colours (PLAN §2.1, flipped in
Phase 4). `data-theme="light"` will pin light mode once the flag is on.

| Token | Dark | Note |
|---|---|---|
| `--hb-primary` | `#66bb6a` | Lifted for AA on the dark ground |
| `--hb-primary-container` | `#2e7d32` | The light-mode primary becomes the fill shade |
| `--hb-on-primary` | `#0b2e0f` | |
| `--hb-primary-50/100/200` | `#16301a` / `#1b3f20` / `#245229` | Ladder re-ordered so `-50` is still the subtlest tint against the page |
| `--hb-primary-700/800` | `#81c784` / `#a5d6a7` | |
| `--hb-secondary` | `#ffa040` | |
| `--hb-secondary-fixed` | `#5a2a00` | |
| `--hb-on-secondary-container` | `#ffdcc7` | |
| `--hb-secondary-50/100/700` | `#3a1c00` / `#4d2500` / `#ffb86b` | |
| `--hb-background`, `--hb-surface` | `#111412` | |
| `--hb-surface-container-lowest` | `#0c0f0d` | |
| `--hb-surface-container-low` | `#191d1a` | |
| `--hb-surface-container` | `#1e2320` | |
| `--hb-surface-container-high` | `#242926` | |
| `--hb-surface-container-highest` | `#2a2e2b` | |
| `--hb-on-surface` | `#e6e3e1` | |
| `--hb-on-surface-variant` | `#bfcab7` | |
| `--hb-outline` / `--hb-outline-variant` | `#8a9484` / `#404a3b` | |
| `--hb-scrim` | `rgba(0,0,0,0.6)` | |
| `--hb-error` / `-container` | `#ffb4ab` / `#93000a` | on-: `#690005` / `#ffdad6` |
| `--hb-success-container` / on- | `#1b3f20` / `#c8e6c9` | |
| `--hb-info` / `-container` | `#7fb8ff` / `#0b3b6b` | on-: `#002f5c` / `#dbe9ff` |
| `--hb-on-warning`, `--hb-on-sale`, `--hb-on-low-stock` | `#3a1c00` | Dark text on the lifted orange |
| `--hb-shadow-color` | `#000000` | Shadows go true black; an on-surface tint would read as a halo |

Semantic roles not listed inherit their light aliases, which already point at tokens that
re-theme (`--hb-success` → primary, `--hb-sale` → secondary-700, etc.).

## Screens
All seven screens are pulled into `docs/design/<screen>/` and mirrored as `@dsCard` cards in
the `claude-design/` bundle.

Pulled & implemented:
- **login** — `docs/design/login/` → `apps/web/.../auth/login`
- **register** — `docs/design/register/` → `apps/web/.../auth/register`

Pulled, not yet implemented:
- **storefront** — `docs/design/storefront/`
- **product-discovery** — `docs/design/product-discovery/` (catalog / PLP)
- **product-detail** — `docs/design/product-detail/`
- **checkout** — `docs/design/checkout/` (secure checkout)
- **vendor-dashboard** — `docs/design/vendor-dashboard/` (desktop)
