# Styling And Theme

## Theme Source

Use `hb-landing/src/styles.scss` as the source of truth for H&B visual direction.

## Core Brand Tokens To Reuse

- Green raw: `#2e7d32`
- Orange raw: `#f57c00`
- Soft accent wash: `#fff8ef`
- Soft accent surface: `#fff3e0`
- Rounded button style with large pill radius
- `Plus Jakarta Sans` typography

## Frontend Guidance

- Buttons should feel consistent with the landing site: rounded, friendly, and clear.
- Forms should use clean spacing, readable labels, and visible validation states.
- Auth screens use a two-panel branded layout with H&B green/orange accents, soft cream surfaces, large brand-led headings, and compact card-like form shells.
- Auth success feedback uses Angular Material snackbars styled with H&B green and soft orange accents.
- Product cards should favor clean white or soft-tinted surfaces with restrained use of orange highlights and green primary actions.
- Keep responsive layouts simple and commerce-friendly, especially for product grids, filters, and checkout-adjacent flows when those exist.
- Reuse spacing rhythms and section clarity from the landing site rather than introducing dense dashboard styling too early.

## Recommended UI Priorities

- clear product imagery
- obvious price and stock messaging
- accessible forms
- consistent CTA hierarchy
- mobile-friendly spacing and stacking

## Notes

- `hb-frontend` has its own `src/styles.scss`, but brand decisions should still be cross-checked against `hb-landing`.
- Exact component-level storefront styling is still open because the marketplace UI is not built yet.
