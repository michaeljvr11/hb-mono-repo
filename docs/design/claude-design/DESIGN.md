---
name: Trans-Frontier Commerce System
source: migrated from Stitch project 18341348034117446938 (2026-06-18)
claude-design-project-id: 79b1b10c-28fd-496f-9956-6f71670c11d1
canonical-tokens: docs/design/DESIGN.md
---

# HB — Trans-Frontier Commerce System

Design system for the HB cross-border marketplace (South Africa → Namibia). This is the
**Claude Design** copy that gets pushed to claude.ai/design. The repo's canonical token
reference is [`docs/design/DESIGN.md`](../DESIGN.md); keep the two in step when tokens change.

Built on three pillars — **Reliability, Efficiency, Transparency**. Corporate/modern aesthetic:
clarity over decoration, generous whitespace to manage e-commerce information density,
professional but approachable.

## Colors

| Token | Value | Usage |
|---|---|---|
| `primary` | `#015300` | Primary actions, links, focus ring |
| `primary-container` | `#026e00` | Lighter primary / hover accents |
| `on-primary` | `#ffffff` | Text/icons on primary |
| `secondary` | `#964900` | Earth-tone accent, auxiliary icons |
| `background` / `surface` | `#fcf9f8` | Page background, app surface |
| `surface-container-lowest` | `#ffffff` | Cards, inputs |
| `surface-container-low` | `#f6f3f2` | Subtle hover fills |
| `surface-container` | `#f0eded` | Panels, trust-badge fill |
| `on-surface` | `#1c1b1b` | Body text / headings |
| `on-surface-variant` | `#404a3b` | Labels, secondary text |
| `outline` | `#707a6a` | Strong input borders |
| `outline-variant` | `#bfcab7` | Card borders, dividers |
| `error` | `#ba1a1a` | Validation / error text |

Focus ring: border `#015300` + `box-shadow: 0 0 0 2px rgba(1,83,0,0.1)`.

## Typography

Font: **Inter** (400/500/600/700/800), system-ui fallback. Headlines use tight negative
tracking; body runs ~1.5× leading.

| Level | Size / Weight / Tracking |
|---|---|
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

Icons: **Material Symbols Outlined**.

## Spacing & shape

Base-8 scale: `stack-xs 4px`, `stack-sm 8px`, `stack-md 16px`, `stack-lg 24px`, `stack-xl 48px`.
Page margins `16px` (mobile) / `40px` (desktop); container max `1280px`; gutter `24px`.
Radius: `4px` small (checkboxes, tooltips), `8px` default (buttons, inputs, cards),
`12px` large (modals, hero), `full`.

## Elevation

Low-contrast outline + tonal layers, not heavy shadows. 1px `outline-variant` borders on
cards/inputs. Shadows reserved for floating elements (dropdowns, modals): very diffuse
(blur 15px, ~4% opacity), neutral tint.

## Components

- **Primary button** — solid `primary-container` (#026e00), white text, 8px radius.
- **Secondary button** — ghost, 1px primary border.
- **Inputs** — 1px `outline` border, 16px padding; focus → primary border + 2px glow.
- **Product card** — 1px border, no shadow, 1:1 image, bold price, top-left badge slot.

### Marketplace patterns (HB-specific)
- **SME Verified badge** — pill, light-green fill + dark-green text + check icon. Denotes
  South African small-business verification.
- **Cross-border tracker** — linear shipping progress with a dual-flag system (ZA → NA);
  completed segments primary green, active segment accent brown.
- **Currency toggle** — header switch between ZAR and NAD (1:1 peg) for localized comfort.

## Screens (cards in this project)

| Card | Device | Implemented at |
|---|---|---|
| Login | mobile | `apps/web/.../auth/login` |
| Register | mobile | `apps/web/.../auth/register` |
| Storefront | mobile | — |
| Product Discovery | mobile | — |
| Product Detail | mobile | — |
| Secure Checkout | mobile | — |
| Vendor Dashboard | desktop | — |
