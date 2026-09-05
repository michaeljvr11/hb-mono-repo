# PLAN — HB Storefront Visual & Conversion Overhaul

> Written in Phase 0 (2026-09-05). Amend only when reality forces it; record amendments in
> the "Amendments" section at the bottom, dated. `PROGRESS.md` holds live state.

## 1. Design thesis: **The Corridor**

HB is the road from Johannesburg and Cape Town to Windhoek. Not a shop that happens to
ship across a border, but the corridor itself: the route, the handover, the arrival. The
brief proposed "the trusted trade corridor"; I take it and make it concrete.

**What it means visually**

- **Geometry: arcs and waypoints.** The radial nav already speaks this language (a quarter
  disc, items fanned along concentric arcs). Promote it: the desktop category flyout opens
  along a soft arc-shaped reveal, section dividers are a single thin route line with a
  waypoint dot, the cross-border shipping card on the PDP is a literal route strip
  (origin → border → door), the checkout stepper is the same strip. One motif, everywhere.
- **Motion: one spring.** The radial nav's overshoot curve `cubic-bezier(0.34, 1.56, 0.64, 1)`
  becomes `--hb-ease-spring` and is the *only* expressive easing on the site, used at
  high-intent moments (add-to-cart, wishlist, filter apply, step advance, flyout reveal).
  Everything else uses a plain decelerate curve. Reduced motion collapses both to opacity.
- **Colour: land and sun.** Green (`--hb-primary`) is the land and "go". Orange
  (`--hb-secondary`) is the desert sun and is reserved for *attention that helps the buyer*:
  the sale price, the low-stock state, the active waypoint. Never decoration. This gives the
  existing palette a reason to exist instead of being "green Material".
- **Type: infrastructure, not boutique.** Inter only, nine steps, fluid at the top of the
  scale. Headlines set tight and heavy (700/800); everything else calm (400/500). Price is
  always the largest type on a card after the name.
- **Trust as content, not chrome.** Every moment of doubt gets an answer in the layout: the
  card says who sells it and where it ships from; the PDP says what it costs landed, when it
  arrives, and how to return it; the cart shows the landed total with no surprises; checkout
  shows who handles the card. The SACU/1:1 peg advantage becomes the headline claim on the
  hero: **"No duties. No exchange-rate surprises. One price, delivered to Namibia."**
- **Craft signals of a real company:** a dark theme, skeletons, honest empty states,
  consistent elevation, and a header that has an information architecture.

**The bar** (from the brief): a Namibian shopper who has never heard of HB lands on the
desktop storefront and believes it is real, safe and well-funded, and remembers it.

## 2. Where I disagree with the brief's phasing, and why

1. **Dark theme auto-activation moves to the end of Phase 4, not Phase 1.** Phase 1 ships the
   full dark token set under `[data-theme="dark"]` only. With ~15k lines of SCSS still carrying
   hard-coded `rgba()` and hex values, enabling `prefers-color-scheme: dark` in Phase 1 would
   hand every dark-mode user a half-broken site, which violates §6.4 ("contrast holds in both
   themes"). The `@media (prefers-color-scheme: dark)` block is written in Phase 1 but wrapped
   in a `:root:not([data-theme="light"])` guard *and* commented out behind a single flag line;
   Phase 4 flips it once the storefront funnel (shop, discover, card, PDP, cart, checkout) has
   no hard-coded colours left. If the budget dies before that, the dark theme remains
   opt-in via the attribute and nothing regresses.
2. **Skeleton loaders for the product grids move from Phase 4 into Phase 3.** I am rewriting
   those grids anyway; doing the hourglass → skeleton swap in the same edit is cheaper than
   returning to the files. The shared `<app-skeleton>` primitive is built in Phase 3 and
   rolled out to the remaining ~19 templates in Phase 4.
3. **Header category navigation is a visible category bar plus a flyout, not a hover
   mega-menu.** Justification in Phase 2 below.
4. **Phase 1 includes a build-plumbing step** (`stylePreprocessorOptions.includePaths` so
   components can `@use 'tokens'` for breakpoint mixins). CSS custom properties cannot be used
   inside `@media` queries, so breakpoints must be SCSS-side; without an include path every
   component would need a fragile relative import.

Everything else stays in the brief's order.

## 3. Phase plan

### Phase 1 — Token foundation
**Goal:** a real system in `:root`; nothing looks different yet except type-scale outliers.

Files:
- `apps/web/src/styles.scss` (rewrite the `:root` block; add dark block; keep every existing
  Material override and its comments intact)
- `apps/web/src/styles/_tokens.scss` (new: SCSS breakpoint map + `bp()` mixin,
  `container()` mixin, `elevation()` helper, type-step mixin)
- `apps/web/angular.json` (`stylePreprocessorOptions.includePaths: ["src/styles"]` on build
  and test)
- `docs/design/DESIGN.md` (token tables rewritten to match; type scale; dark theme section)
- `apps/web/src/app/shared/components/radial-nav/radial-nav.scss` (consume the new motion
  tokens; visual identical)

Token set:
- **Colour.** Keep the 17. Add tints/shades: `--hb-primary-{50,100,200,700,800}`,
  `--hb-secondary-{50,100,700}`. Semantic aliases: `--hb-success`, `--hb-warning`,
  `--hb-info`, `--hb-sale`, `--hb-low-stock`, each with `-container` and `on-` pairs.
  `--hb-surface-container-high`/`-highest` to complete the elevation ladder. `--hb-focus-ring`.
- **Spacing.** `--hb-space-{1..12}` on a 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96.
- **Radius.** `--hb-radius-{xs,sm,md,lg,xl}` = 4, 8, 12, 16, 24 plus existing `pill`.
- **Elevation.** `--hb-elevation-{0..4}`, each a two-layer shadow tinted with the on-surface
  colour so it survives the dark theme. Collapse the 22 one-offs onto these in later phases.
- **Motion.** `--hb-duration-{fast,base,slow,slower}` = 120, 200, 320, 520ms;
  `--hb-ease-standard`, `--hb-ease-decelerate` (0.22,1,0.36,1), `--hb-ease-spring`
  (0.34,1.56,0.64,1). Global `prefers-reduced-motion` rule zeroes durations.
- **Z-index.** `--hb-z-{raised,sticky,header,dropdown,scrim,modal,toast}` = 1, 100, 200, 300,
  400, 500, 600.
- **Layout.** `--hb-container-{content,wide,max}` = 1280, 1440, 1680px;
  `--hb-gutter: clamp(16px, 4vw, 48px)`; SCSS breakpoints `sm 480, md 768, lg 1024, xl 1280,
  2xl 1440, 3xl 1680`.
- **Type.** Nine steps as custom properties: `--hb-text-xs` 12, `sm` 14, `md` 16, `lg` 18,
  `xl` 20, `2xl` 24, `3xl` clamp(28→32), `4xl` clamp(36→48), `display` clamp(44→72).
  Mapping for the 20 drifted values: 10/11→xs; 13→sm; 15→md; 22→xl; 26→2xl; 28/30→3xl;
  36/40→4xl; 56/72→display. Migrate the outliers (10,11,13,15,22,26,30,36,56,72: ~80
  declarations) in this phase; the in-scale values are left alone until their component is
  touched.
- **Dark theme.** Same hues, surfaces derived: background `#111412`, surface steps up to
  `#2a2e2b`, on-surface `#e6e3e1`, primary lifted to `#66bb6a` for AA on dark, secondary
  `#ffa040`, on-primary `#0b2e0f`. Delivered under `[data-theme="dark"]`; the
  `prefers-color-scheme` block is present but disabled (see §2.1 above).

DoD extra: `grep -c 'font-size: 1[0135]px\|font-size: 2[26]px\|font-size: 30px\|font-size: 36px\|font-size: 56px\|font-size: 72px'` over `apps/web/src` returns 0.

### Phase 2 — Desktop navigation and shell
**Goal:** desktop has an information architecture; 768–1280px is no longer empty.

Decision, **category bar + flyout rather than a hover mega-menu:**
- Our taxonomy is shallow (`parentId` optional; seed data likely flat). A mega-menu with
  three links per column looks abandoned, which is the opposite of the trust signal we need.
- Baymard: visible top-level categories beat hidden ones, and 67% of nav implementations are
  mediocre because of interaction detail. A visible bar has no hover-delay failure mode.
- Pattern: a second header row at `≥1024px` with the top 6–8 categories by `displayOrder`
  as plain links, followed by an "All categories" trigger. The trigger opens a flyout panel
  (click, or hover with a 400ms intent delay) listing every category, grouped under parents
  when `parentId` is present, in a 3–4 column grid. Panel reveals along an arc clip-path with
  `--hb-ease-spring`; reduced motion = fade. Escape closes; focus is trapped while open;
  `aria-expanded` on the trigger.
- Between 768 and 1024 the category row becomes a horizontally scrolling chip strip (reuse
  `category-chips`), so the dead zone gets categories too.

Search: a real input in the header at `≥768px` (reuse `search-bar` in a compact variant),
submitting to `/discover?q=`. The icon button remains below 768px. The `shop.html`
mobile toolbar keeps its search bar; the header one is hidden there to avoid two inputs.

Shell: containers move to `--hb-container-content` (1280) for reading surfaces and
`--hb-container-wide` (1440) for product grids and the header inner. Above 1680 the page
stops growing and the margin carries it. Header becomes sticky (`--hb-z-header`) with a
compact state after 80px scroll (CSS `scroll-driven` where supported, `IntersectionObserver`
fallback guarded by `isPlatformBrowser`). Footer gets 1024/1440 tiers.

Files:
- `apps/web/src/app/layout/nav-bar/{nav-bar.html,nav-bar.scss,nav-bar.ts,nav-bar.spec.ts}`
- `apps/web/src/app/layout/category-nav/*` (new standalone component: bar + flyout; consumes
  `core/api/categories.service.ts`, no service changes)
- `apps/web/src/app/shared/components/search-bar/*` (add `variant="header"` input)
- `apps/web/src/app/shared/components/category-chips/*` (reused in the 768–1024 tier)
- `apps/web/src/app/layout/footer/footer.scss`
- `apps/web/src/styles.scss` (container utility classes) and the 13 `max-width: 1280px`
  sites → container mixin
- `apps/web/src/app/features/shop/{shop.html,shop.scss}` (toolbar visibility rules only)

### Phase 3 — Storefront and product presentation
**Goal:** the highest-traffic component and the landing page carry the thesis.

Hero: the existing `hero-import-shopping-*` photography, `<picture>` with WebP first,
`fetchpriority="high"`, explicit dimensions, dark gradient scrim from the bottom-left, copy
above it. Headline is the SACU advantage. Below the hero a **trust strip** of four
waypoints: "Ships from South Africa", "No customs duties (SACU)", "Pay in ZAR or NAD, 1:1",
"Delivered to your door in Namibia". Above 1280 the hero is a 7/5 split (copy | image) so
the image is not stretched to 1920 and LCP stays small; below that it stacks.

Product card:
- Fluid: `width: 100%`, grid owns the columns. Carousel variant keeps a `min-width` via the
  parent's `grid-auto-columns`.
- New content, all styling-only against existing DTO fields: vendor line
  (`vendor.businessName` or "Sold by HB" for platform listings) with a small origin flag
  chip; stock state from `stockQuantity` / `sizes[].stockQuantity` (in stock · only N left
  ≤ 5 · sold out); "Sizes available" retained. Rating slot rendered only when
  `averageRating` is present on the input (typed as `ProductDto & Partial<RatingFields>`
  locally, no shared-type change), so it is a no-op today.
- Sale price slot designed for `compareAtPrice` (absent today; follow-up card), rendered
  only when present.
- Desktop hover: elevation lift, second image fade-in when `images[1]` exists, add-to-cart
  button reveal; touch devices keep the button always visible.
- Add-to-cart press: spring scale + check icon swap for 900ms; wishlist toggle: spring pop.
- Skeleton variant of the card (`<app-product-card-skeleton>`) with the shared
  `<app-skeleton>` primitive (new, `shared/components/skeleton/`).

Grids: `grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr))` with gap on
the spacing scale; wide container. Yields 2 cols at 360, 3 at 768, 5 at 1280, 6 at 1440+.

Sections: category grid becomes a route of waypoint tiles (icon + name + count when
available); vendor showcase gets the seller-identity treatment (name, listing count, "ships
from"); trust banner becomes the waypoint strip; newsletter loses the generic gradient.

Files:
- `apps/web/src/app/shared/components/product-card/*`
- `apps/web/src/app/shared/components/skeleton/*` (new)
- `apps/web/src/app/features/shop/*`
- `apps/web/src/app/features/discover/{discover.html,discover.scss}` (grid + skeleton only)
- `apps/web/src/app/features/wishlist/{wishlist.html,wishlist.scss}` (grid + skeleton only)
- `apps/web/src/app/features/vendors/vendor-profile/*` (grid + skeleton only)
- `apps/web/src/app/shared/components/{trust-banner,vendor-showcase,category-chips}/*`
- `docs/design/DESIGN.md` (component section for card and trust strip)

### Phase 4 — Trust, states, perceived performance
**Goal:** the Namibian conversion barrier is addressed at every moment of doubt.

- `<app-skeleton>` rolled out to the remaining hourglass templates (list in PROGRESS when
  reached). `.state-message` consolidated into a shared `<app-state-message>` with
  `kind="loading|empty|error"` and a mandatory action slot so no state is a dead end.
- `<app-trust-strip>` (from Phase 3) placed on discover (below filters), PDP (under price),
  cart (above totals), checkout (beside payment).
- Cart and checkout: payment-security block (lock icon, provider names from settings,
  "HB never stores your card"), landed-cost line items labelled explicitly ("Customs duties:
  R0.00 (SACU)").
- Micro-interactions: filter apply on discover (results fade-through), checkout step
  advance (waypoint fills along the route strip). All under `prefers-reduced-motion`.
- **Flip the dark theme on** via `prefers-color-scheme` once `grep` shows zero raw hex/rgba in
  the funnel files; verify contrast on shop, discover, PDP, cart, checkout in both themes.

Files: `shared/components/{state-message,trust-strip}/*` (new), the hourglass templates,
`features/{discover,cart,checkout}/*` (visual only), `styles.scss` (theme flag), `DESIGN.md`.

### Phase 5 — PDP, cart, checkout
**Goal:** bottom of funnel reads as safe.

- PDP: gallery with thumbnails on the left at `≥1280`, sticky buy box on the right (title,
  price, vendor block, size picker, stock, add-to-cart, wishlist); the cross-border shipping
  card promoted directly under the buy box as the **route strip** (origin → SACU border →
  Namibia door, with delivery window and returns line); reviews tab gets summary bar and
  distribution.
- Cart: line items with vendor grouping, right-rail summary with landed-cost breakdown, sticky
  on desktop, progression CTA.
- Checkout: single-column scroll with the route-strip stepper, summary rail on desktop,
  security block by payment. No logic changes.

Files: `features/product-detail/*`, `features/cart/*`, `features/checkout/*`, `DESIGN.md`.

### Phase 6 — Follow-up cards (written, not built)
See §5 below; kept current as phases expose more gaps.

## 4. Verification recipe (every phase)

```
npm run build
npm run test -w @hb/web
```
Then `preview_start` the web dev server (and API if the screen needs data), screenshot at
360 / 768 / 1280 / 1440 / 1920 in light, and dark via `document.documentElement.dataset.theme
= 'dark'`; check `document.documentElement.scrollWidth <= innerWidth` at each width. Record
the screenshot paths under `docs/design/redesign/evidence/phase-N/` and reference them in
`PROGRESS.md`.

## 5. Proposed Trello cards (Phase 6 deliverable, growing)

1. **Ratings on product listings.** Add `averageRating?: number` and `reviewCount?: number`
   to `ProductDto` in `libs/shared/src/contracts/product.ts`; populate in
   `apps/api` products service via a join/subquery on reviews (reuse the aggregation behind
   `ReviewSummaryDto`); include in list and detail responses. Web: remove the local
   `Partial<RatingFields>` widening in `product-card.ts` and read the fields directly. AC:
   card shows "★ 4.6 (128)" when `reviewCount > 0`, nothing otherwise; unit test on the
   aggregation; no N+1.
2. **Compare-at price.** `compareAtPrice?: number` on `ProductDto`, entity column
   `numeric(12,2)` nullable via migration, vendor/admin product forms, validation
   `compareAtPrice > price`. Card and PDP already render the slot.
3. **Vendor verification flag.** `isVerified: boolean` + `verifiedAt` on the vendor entity
   and `ProductVendorDto`; admin toggle; card/PDP badge slot already designed.
4. **Delivery window data.** Per-vendor `leadTimeDaysMin/Max` (platform default from
   settings) so the card's "Ships in 2–4 days" is data, not copy.
5. **Buyer-protection policy copy.** Owner decision on whether HB holds payment until
   delivery; if yes, canonical one-line copy for trust strip and checkout.
6. **Second product image on hover.** Only needs `images[1]` which exists; card supports it
   from Phase 3. Card is a content task: ensure listings upload two images.
7. **Header search suggestions + collapse `/discover`'s own controls.** (Phase 2 exposed.)
   Give `<app-search-bar variant="header">` the same suggestion feed `/discover` uses
   (`GET /search/suggest`), then hide `/discover`'s page-level search bar and chip row at
   ≥768px so desktop has one search input and one category strip. AC: one `.search-bar__input`
   in the DOM at 1280 on `/discover`; typing in the header shows grouped suggestions; the
   header input is seeded with the current `q` on `/discover`.
8. **Sub-categories in the flyout.** The flyout already groups under `parentId`; the seed and
   admin UI only create top-level categories. Owner decision on whether the taxonomy gets a
   second level; if yes, add `parentId` to the admin category form and seed a few children so
   the grouped layout is exercised.
9. **Product photography.** (Phase 3 exposed.) All ten seed products have `images: []`, so
   every card, the PDP gallery and the hover cross-fade render the placeholder. The card's
   image plumbing (srcset/sizes/variants, `images[1]` hover) is finished but untested against
   real assets. Content task: upload at least two images per listing, then re-capture.
10. **Newsletter sign-up is a stub.** (Phase 3 exposed.) The storefront form collects an email
    and answers with a "coming soon" notice. Either wire it to a provider or drop the section
    before launch — a form that discards input is a trust cost on the page arguing for trust.
11. **Vendor listing counts are page-scoped.** (Phase 3 exposed.) `deriveVendorListingCounts`
    counts the storefront's own first 100 products, so a vendor whose listings fall outside
    that page shows no count line. A `productCount` on the vendor directory response would
    make it exact and drop the derivation.

## Amendments

**2026-09-05, Phase 2**
1. *"The icon button remains below 768px"* — it does not. The header never had a search icon
   below 768px: the pre-launch polish hid it there on a measured row-width budget at 360px
   (the wordmark would not fit next to the action row), and `/shop`'s toolbar plus the radial
   nav already carry search on mobile. Phase 2 keeps that decision, so the header search is:
   input at ≥768px, nothing below. The old icon button (≥768px only) is removed rather than
   kept alongside the input.
2. *"IntersectionObserver fallback"* stays, but the sentinel is a 1×80px absolutely positioned
   element at the top of the document (not the header itself), because the header is sticky
   and cannot be its own scroll reference. The observer only runs where
   `CSS.supports('animation-timeline: scroll()')` is false.
3. *Container mixin at the 13 sites* — 11 take the mixin. The PDP (`.pdp`, its sticky bar) and
   the trust banner grid take only the `max-width` token because their gutters live on child
   or parent elements; the PDP keeps its literal 16/40px gutters until Phase 5 so every PDP
   section shares one edge. The landing page, `/discover` and the vendor profile went to
   `wide` (they are grids); cart, checkout, wishlist, PDP stay `content`.
4. The header's category state reads query params from `Router.routerState.root`, not an
   injected `ActivatedRoute`: the header renders on every page and must not depend on the
   routed component's route (or on what a page spec stubs it with).
5. `<app-category-nav>` gets a tiny root-provided `CategoryNavStore` (one fetch per app
   lifetime) instead of calling `CategoriesService.list()` directly — the header is
   re-created on every route change, so a direct call would refetch on every navigation.
   `CategoriesService` itself is untouched, as promised.
6. The radial nav moves from `z-index: 60` to `--hb-z-scrim` (400): at 60 it would have sat
   under the new `--hb-z-header` (200) header, and its open-state blur must cover the header.
7. Not done, deferred to Phase 3/4: the `/discover` page still renders its own search bar and
   chip row at ≥768px, so desktop now shows two search inputs there (header + page). Listed
   in §5 as a card; the page's controls should collapse into the header's once the header
   search grows suggestions.

**2026-09-05, Phase 3**
1. *Grid `minmax(min(100%, 220px), 1fr)`* — shipped at **200px**, and only from 768px up.
   Below 768 the grid is two fixed columns: at 360 the gutters leave 328px of content, so a
   220px minimum yields one column per row and the phone storefront becomes a single tall
   stack. 200px from 768 also gives the intended 3 / 5 / 6 columns at 768 / 1280 / 1440.
2. *"Grids: … wide container"* — the grid utility is width-agnostic; the containers were
   already set in Phase 2 and were not touched.
3. The trust strip and the vendor showcase became **variants of the existing components**
   rather than new ones. `<app-trust-banner variant="strip|cards">` keeps the Procurement
   Service page (its only other consumer) on the old 3-up card grid, which its own copy was
   written for; `strip` is the storefront default. Same reasoning for the showcase, which
   simply lost its fake stars.
4. The vendor showcase gained a `listingCounts` input fed by a new pure
   `deriveVendorListingCounts` in `shop.ts` — "N listings" is real data, unlike the five stars
   it replaces. Listed as follow-up card 11 because it only sees the storefront's own page.
5. Hero: the copy is the SACU claim from §1 verbatim, and the photograph
   (`hero-import-shopping`, already in `public/images` and until now unreferenced) is a road
   through desert — the Corridor, literally. `SITE_IMAGES.hero`'s doc comment said "not yet
   referenced by any page"; it is now.
6. Four hero tokens were added (`--hb-hero-surface`, `--hb-on-hero`, `--hb-on-hero-muted`,
   `--hb-hero-accent`) instead of reusing a ladder step. The dark theme re-orders the tint
   ladders, so no step is a safe hero ground in both themes; only `--hb-hero-surface` changes
   under dark.
7. The category section became waypoint tiles on a route line (icon · name · count · chevron)
   rather than the old centred icon cards, and the count falls back to "Browse" at zero so a
   fresh catalogue never advertises "0 products".
8. Card stock state sums `sizes[].stockQuantity` for sized products. `stockQuantity` is not
   meaningful on those rows (see `wishlist.ts`), so reading it alone would have shown "Sold
   out" on every sized product.
9. `capture.mjs`'s `!loading` modifier does **not** work by blocking the API and reloading:
   SSR fetches server-side, so the HTML arrives populated and the client requests nothing.
   It seeds `/discover`, holds the listing requests open, then enters the target route by
   client-side navigation (brand link / category chip) and asserts a skeleton is on the page
   before capturing.
