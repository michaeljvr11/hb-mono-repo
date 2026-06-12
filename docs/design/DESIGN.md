# HB Design System — Source of Truth

> **STATUS: PLACEHOLDER.** Replace this file with the `DESIGN.md` exported from Stitch
> (Stitch → project → export panel). Until then, agents fall back to Angular Material 21
> defaults and must not invent custom tokens.

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

## Tokens (replace with Stitch export)

### Colors
| Token | Value | Usage |
|---|---|---|
| `--hb-primary` | TBD | Primary actions, links |
| `--hb-surface` | TBD | Cards, panels |
| `--hb-text` | TBD | Body text |

### Typography
| Token | Value |
|---|---|
| Font family | TBD |
| Type scale | TBD |

### Spacing
TBD — Stitch export defines the scale.

## Screens needed (seed list for Stitch)
- catalog / product listing (PLP)
- product detail
- cart
- checkout
- order confirmation
- vendor dashboard (minimal admin)
