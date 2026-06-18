# HB Design System — Source of Truth

> **STATUS: SEEDED from the Stitch "Trans-Frontier Commerce System" design system**
> (first pull: Login + Register screens, card `mMFxZIKE`). Tokens below are canonical.
> Screens not yet pulled still fall back to these tokens + Angular Material 21 defaults;
> do not invent values outside this palette.

## How this directory works

```
docs/design/
├── DESIGN.md          ← this file: tokens (colors, typography, spacing, components)
└── <screen>/          ← one folder per Stitch screen, e.g. product-detail/
    ├── export.html    ← Stitch HTML + Tailwind export
    └── reference.png  ← screenshot of the design
```

The `design-to-code` agent reads all three and produces Angular standalone components.
Tokens in this file are **canonical** — exported HTML is reference material, not truth.

**Agent workflow for a new screen:**
1. Use `stitch` MCP tools → list projects → fetch the screen design
2. Save raw output to `docs/design/<screen>/export.html` + `reference.png`
3. Update token tables in this file if the design introduces new values
4. Invoke the `design-to-code` agent with the export path; it handles Angular conversion

## Tokens (Stitch export — canonical)

### Colors
| Token | Value | Usage |
|---|---|---|
| `--hb-primary` | `#015300` | Primary actions, links, focus ring |
| `--hb-primary-container` | `#026e00` | Lighter primary / hover accents |
| `--hb-on-primary` | `#ffffff` | Text/icons on primary |
| `--hb-secondary` | `#964900` | Accent (earth-tone), auxiliary icons |
| `--hb-background` | `#fcf9f8` | Page background |
| `--hb-surface` | `#fcf9f8` | App surface |
| `--hb-surface-container-lowest` | `#ffffff` | Cards, inputs |
| `--hb-surface-container-low` | `#f6f3f2` | Subtle hover fills |
| `--hb-surface-container` | `#f0eded` | Panels, trust-badge fill |
| `--hb-on-surface` | `#1c1b1b` | Body text / headings |
| `--hb-on-surface-variant` | `#404a3b` | Labels, secondary text |
| `--hb-outline` | `#707a6a` | Strong input borders |
| `--hb-outline-variant` | `#bfcab7` | Card + subtle borders, dividers |
| `--hb-error` | `#ba1a1a` | Validation / error text |

Focus ring: border `#015300` + `box-shadow: 0 0 0 2px rgba(1,83,0,0.1)`.

### Typography
| Token | Value |
|---|---|
| Font family | `Inter` (400/500/600/700/800), system-ui fallback |
| `display-lg` | 48px / 700 / -0.02em |
| `headline-lg` | 32px / 600 / -0.01em |
| `headline-lg-mobile` | 28px / 600 |
| `headline-md` | 24px / 600 |
| `title-lg` | 20px / 500 |
| `body-lg` | 18px / 400 |
| `body-md` | 16px / 400 |
| `body-sm` | 14px / 400 |
| `label-lg` | 14px / 600 |
| `label-sm` | 12px / 500 |

Icons: **Material Symbols Outlined** (loaded in `apps/web/src/index.html`).

### Spacing & shape
Base-8 scale: `stack-xs 4px`, `stack-sm 8px`, `stack-md 16px`, `stack-lg 24px`, `stack-xl 48px`;
page margins `16px` (mobile) / `40px` (desktop); container max `1280px`.
Radius: `4px` (small), `8px` / `lg` (buttons, inputs, cards), `12px` / `xl` (large cards, modals), `full`.

## Screens
Pulled & implemented:
- **login** — `docs/design/login/` → `apps/web/.../auth/login`
- **register** — `docs/design/register/` → `apps/web/.../auth/register`

Seed list (not yet pulled):
- catalog / product listing (PLP)
- product detail
- cart
- checkout
- order confirmation
- vendor dashboard (minimal admin)
