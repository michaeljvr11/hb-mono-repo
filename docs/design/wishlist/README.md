# Wishlist — design artifact

`export.html` in this folder is **hand-authored**, not synced from Claude Design.

## Why
No Wishlist screen exists in the Claude Design project yet, and pulling a new screen via
`/design-sync` (`DesignSync` tool) requires an interactive login that was unavailable in the
session that implemented WL-4. `docs/design/vendor-profile/` set the precedent for this
approach on an earlier card: author a static HTML mock using the canonical tokens from
`docs/design/DESIGN.md` (same Tailwind config shape as the real exports — colors, spacing,
type scale, `Material Symbols Outlined` icons) so there's still a structural reference to
build the Angular component against and to keep traceability with the rest of `docs/design/`.

## What it covers
- Shared app header (mirrors the real `NavBar` in the app shell).
- Loaded state: an in-stock ZAR row and an out-of-stock NAD row, each with image (or
  placeholder), name, live price, remove control, and add-to-cart control (disabled + badge
  for the out-of-stock row).
- Empty state with a "Browse products" CTA.

## Follow-up
If/when a Wishlist screen is authored in Claude Design, replace this file via the normal
`/design-sync` pull and update this README (or delete it if the sync bundle documents
provenance itself).
