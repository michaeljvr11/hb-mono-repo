# BRIEF — HB Storefront Visual & Conversion Overhaul

> **For the human running this:** this file is the prompt. Run it as a **main Claude Code
> session with the model set to Claude Fable** — not as a subagent. You need to watch and
> steer a model whose turns run many minutes, and §6's browser verification is most reliable
> on the main session.
>
> **Cost control:** `/clear` at every phase boundary, then say *"read
> `docs/design/redesign/PROGRESS.md` and continue from the first phase not marked DONE."*
> Each phase then runs on a small cold context instead of dragging Phase 0 along at
> $10/MTok. The resume protocol in §0.2 is written to make this free.

---

## 0. HOW TO WORK — read this section first, every single session

### 0.1 You may not finish. Design for that.

There is a **hard budget of roughly US$34** of Fable 5.1 usage for this entire effort
(input $10/MTok, output $50/MTok). That is on the order of a few hours of heavy agentic
work, not a few days. You will very likely be stopped mid-way and resumed later — possibly
by a different, cheaper model.

Therefore **the durable artefacts matter more than the code you happen to reach.** A
half-executed plan with an excellent written plan is a success. A beautiful half-refactor
with nothing written down is a failure.

### 0.2 The resume protocol

Three files under `docs/design/redesign/` are your memory:

| File | Purpose |
|---|---|
| `RESEARCH.md` | What you learned from your own research. Written once, appended rarely. |
| `PLAN.md` | The full phased plan. Written once in Phase 0, amended only when reality forces it. |
| `PROGRESS.md` | Living state. Updated at the **end of every phase, without exception.** |

**On every session start — including the very first thing you do:**

1. `ls docs/design/redesign/` and read whichever of the three exist.
2. If `PROGRESS.md` exists, it is the truth. Find the first phase not marked `DONE`,
   read its "Next action" line, and continue from exactly there. Do **not** re-run
   research, do **not** re-plan, do **not** re-audit the codebase.
3. If none exist, you are starting fresh: begin at Phase 0.

`PROGRESS.md` must always contain, for each phase: status (`TODO` / `IN PROGRESS` /
`DONE`), the files touched, the commit SHA if committed, any decision made that isn't
obvious from the diff, and a one-line **"Next action"** so a cold reader can pick up
without re-deriving anything.

### 0.3 Spend discipline

- Do not read files you do not need. §2 of this brief is a real audit of the codebase —
  trust it and spot-check rather than re-reading everything.
- Do not re-read a file you just edited to verify it; the edit tools error on failure.
- Prefer targeted `grep` / `sed -n` over whole-file reads on the large SCSS files.
- Time-box research (§4). It is easy to spend a third of the budget reading the web.
- Commit at the end of every phase. An uncommitted working tree at budget exhaustion
  is lost work.

---

## 1. THE PRODUCT

**HB** is a cross-border e-commerce and logistics platform: **South Africa → Namibia**.
Two business models share one codebase — platform-fulfilled listings (HB sources, lists,
and ships) and a vendor marketplace (South African SMEs list and fulfil themselves).
ZA/NA are in a customs union with a 1:1-pegged currency (ZAR/NAD).

### Target market — this shapes every design decision

- **Buyers are Namibian consumers**, largely younger and mobile-first, buying goods that
  are hard to get locally, from South African sellers they have never heard of.
- **Trust is the #1 conversion barrier, not aesthetics.** Namibian e-commerce is nascent;
  research consistently shows payment-fraud fear, identity-theft fear, and a history of
  short-lived local platforms with poor payment security. A Namibian shopper's default
  assumption about a new site is that it might not be real.
- **Cross-border is the anxiety multiplier.** "Will it actually clear customs?" "What will
  it really cost me landed?" "How long?" "What if I need to send it back?" A shopper who
  cannot answer those four questions on a product page does not buy.
- **Sellers are South African SMEs** — the marketplace side needs to look like a platform
  worth listing on, and a vendor storefront needs to make an unknown small business look
  credible.
- **Bandwidth and data cost are real.** Rural connectivity is patchy. Heavy hero video and
  megabyte-scale imagery are a conversion tax here, not a flourish.

**The design implication:** for this audience, *credibility signals are conversion
features*. Transparent landed cost, explicit customs handling, visible delivery windows,
visible return terms, real vendor identity, and honest stock/status states will move
revenue more than any amount of polish. Build the polish around them, not instead of them.

### The colour palette is deliberate — do not replace it

The greens and warm orange are a **Namibian-themed brand palette**, owner-confirmed and
migrated deliberately (see the `LSM-1` comments in `apps/web/src/styles.scss`). They are not
placeholder Material defaults.

**You may not** change the brand hues, swap to a different palette, or "modernise" the
brand into something neutral or monochrome.

**You may and should** build a proper *system* around them: tints and shades, surface
elevation steps, semantic aliases (success / warning / info / on-sale / low-stock), a dark
theme derived from the same hues, and accessible foreground pairings. Extending the palette
is the job. Replacing it is out of scope.

---

## 2. CURRENT STATE — a real audit. Trust this; don't redo it.

### 2.1 Stack

- `apps/web` — **Angular 21 SSR** (`@angular/ssr` + Node Express), standalone components,
  signals, new control flow (`@if` / `@for`), typed forms. Angular Material 21 is a
  dependency but **no Material theme is loaded** — component tokens are set by hand in
  `styles.scss` (see the snackbar and datepicker comment blocks; that pattern is load-bearing).
- Styling is **hand-written scoped SCSS per component**. No Tailwind, no utility layer, no
  shared mixin library. `apps/web/src/styles.scss` (630 lines) is the only global sheet.
- Fonts: Inter + Material Symbols Outlined, both from Google Fonts in `index.html`.
- `libs/shared` (`@hb/shared`) is the API contract — interfaces and enums only.

### 2.2 Routes and screens that exist

Public: `/shop` (storefront landing, the `/` redirect target), `/discover` (search + PLP),
`/products/:id` (PDP), `/vendors/:id` (public vendor storefront), `/about`, `/services`,
`/contact`, `/legal/*` (7 policy pages).
Auth-gated: `/cart`, `/checkout`, `/wishlist`, `/profile/*`.
Role-gated: `/vendor/*` (6 pages), `/admin/*` (11 pages).

### 2.3 Design tokens — thin

`:root` in `styles.scss` defines **17 colour custom properties and exactly one other token**
(`--hb-radius-pill`). There is **no** token for spacing, elevation/shadow, motion/easing,
z-index, container width, general border radius, or breakpoint.

Consequences measured across `apps/web/src/**/*.scss` (15,171 lines of SCSS):

- **The type scale has drifted badly.** `docs/design/DESIGN.md` defines 10 sizes. The code
  uses **20 distinct `font-size` px values**, including 11, 13, 15, 22, 26, 30, 36, 40, 56
  and 72px — none of which are in the documented scale.
- **No elevation system.** ~20 distinct one-off `box-shadow` values, all hand-rolled.
- **Spacing is literal px everywhere** — the base-8 scale in DESIGN.md exists only as prose.
- **No dark mode at all.**

### 2.4 Desktop is the weak surface — this is the core problem

- `768px` is effectively the *only* breakpoint (58 occurrences). `1024px` appears 7 times,
  `1280px` 3 times. **Desktop is mobile stretched to 1280px**, not a designed layout.
- Containers cap at `max-width: 1280px` (13 occurrences). On a 1440–1920px display the page
  is a narrow column in a sea of `--hb-background`.
- The product grid on both `/shop` and `/discover` is `repeat(2, 1fr)` → `repeat(4, 1fr)` at
  1024px, and **never goes wider**. Four columns at 1920px means enormous cards and very
  little product visible per screen.
- Product cards are **fixed-width** (`260px`, `280px` ≥768px; carousel variant `160px`) —
  they don't participate in a fluid grid.
- **The desktop header has no category navigation whatsoever.** `nav-bar.html` is: brand,
  "Sell on H&B", a stub currency switcher, and four icon buttons. Category discovery only
  exists via the category grid partway down `/shop`, or chips on `/discover`. The search +
  category-chip toolbar in `shop.html` is explicitly `display: none` above 768px. For a
  marketplace this is the single largest desktop navigation gap.
- The "Sell on H&B" link and the currency switcher are hidden below `1280px` — so between
  768px and 1280px (a very common laptop range) the header is nearly empty.
- The `/shop` hero is a **CSS gradient with no imagery**, even though responsive hero
  photography already exists at
  `apps/web/public/images/hero-import-shopping-{640,960,1280,1536}.{jpg,webp}` and is used
  only on the marketing pages.

### 2.5 Mobile — the radial nav is the good part. Keep it.

`apps/web/src/app/shared/components/radial-nav/` is a **corner quarter-disc FAB that fans
nav items out along concentric arcs**, with staggered spring transitions, labels, badges, a
pulse affordance, and a `prefers-reduced-motion` fallback. It is mobile-only
(`display: none` at ≥768px).

This is the site's one genuinely distinctive interaction and the owner considers it a
keeper. **Do not remove or flatten it.** Treat it as the seed of the design language: the
orbital/arc geometry, the spring easing curve, and the staggered reveal are motifs the rest
of the site — including desktop — currently does not share. Making the whole site feel like
it belongs to the same product as that FAB is a legitimate and desirable outcome.

### 2.6 Conversion gaps (grounded in research already done)

- **Product cards omit ratings.** Baymard lists ratings + review count among the five
  attributes every product listing must show; 50% of sites get listing attributes wrong.
  ⚠️ `ProductDto` in `libs/shared/src/contracts/product.ts` carries **no** rating fields.
  `ReviewSummaryDto` (`averageRating`, `reviewCount`) exists in
  `libs/shared/src/contracts/review.ts` but is not joined onto products. **Surfacing ratings
  on cards is an API change, not a styling change** — see §5, Phase 6.
- **Product cards omit the vendor name**, though `ProductDto.vendor` is present on
  marketplace listings. On a marketplace, seller identity on the card is a trust signal.
- **No skeleton/shimmer loading states anywhere.** Every async surface renders an hourglass
  icon and "Loading products…". This reads as slow and unfinished.
- **No price-per-unit, sale/compare-at price, or stock urgency treatment.**
- The PDP has a good cross-border shipping card (origin → destination, customs) and a
  reviews tab — but it is buried below the fold and styled as an information panel rather
  than as the reassurance moment it should be.
- Empty and error states are plain centred text; they are conversion dead ends with no
  recovery action.

### 2.7 What is already good — build on it, don't rewrite it

- Accessibility discipline is genuinely strong: correct ARIA, `aria-live` regions,
  visually-hidden labels, documented contrast decisions, `prefers-reduced-motion` handling.
  **Do not regress this.**
- The SCSS is heavily and thoughtfully commented, and the comments record *why* — including
  bugs already fixed (box-sizing, flex overflow, Material token fall-through). Read the
  comment before changing the rule; several of them are landmines.
- Responsive images with `srcset` / `sizes`, explicit `width` / `height` (no CLS), and WebP
  derivatives are already wired through `ProductImageDto.variants`.
- Trust content already exists as a component (`trust-banner`), as does a vendor showcase.

---

## 3. NON-NEGOTIABLE CONSTRAINTS

These come from `CLAUDE.md` and `apps/web/CLAUDE.md`. Violating them fails the work.

1. **Never merge to `main`.** Open a PR and stop. A human owns prod. (Git hooks enforce this.)
   When you get to the PR, note the known hook gotcha: `.claude/hooks/block-prod-git.js`
   matches on literal command text, so `gh pr create --base main` is blocked. **Omit
   `--base main`** (it is the default anyway) and run the `git push` as a separate command
   from the `gh pr create`. Getting this wrong costs a wasted turn at $50/MTok output.
2. One branch for this effort: `feat/storefront-visual-overhaul`, created from up-to-date main.
3. **Conventional Commits.** Every commit message body ends with:
   `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
4. Shared types live in `libs/shared`. **Never duplicate DTOs.** API and web both import them.
5. **SSR safety is not optional.** `localStorage`, `window`, `document`, `matchMedia`,
   `IntersectionObserver`, `ResizeObserver` — all must be guarded with `isPlatformBrowser`.
   `AuthService` shows the pattern. An unguarded browser API crashes the SSR render.
6. Modern Angular only: standalone components, signals, typed forms, `@if` / `@for` / `@switch`.
7. `docs/design/DESIGN.md` is the canonical token document. **If you add or change a token,
   you update that file in the same commit.** It must not drift again.
8. Never read or print `.env` files.
9. Do not touch `apps/api` or database migrations for styling work. If a change genuinely
   requires an API field (e.g. ratings on cards), **do not implement it** — write it up in
   `PLAN.md` as a follow-up card and design the component to degrade gracefully without it.
10. `apps/web` tests must pass (`npm run test -w @hb/web`) and the full build must pass
    (`npm run build`).
11. Do not introduce a CSS framework (Tailwind, Bootstrap) or a component library beyond the
    Angular Material 21 already present. The hand-written SCSS + token approach stays.
12. Do not add heavy runtime dependencies. Animation should be CSS or the Web Animations API,
    not a JS animation library.

---

## 4. YOUR RESEARCH — do it, but time-box it

The audit above saves you from re-reading the codebase. It does **not** substitute for your
own design research, and you should form your own opinion rather than executing mine.

**Budget: roughly 10–15 web lookups, then stop and write.** Write everything you learn into
`docs/design/redesign/RESEARCH.md` as you go, so a resumed session never repeats this.

Research directions worth your budget:

- **Reference sites in our alley.** Not just Shopify-template beauty — look at marketplaces
  and cross-border retailers where trust and logistics *are* the product: Takealot (the ZA
  category leader), Superbalist, Zando, Mr Price, Amazon's cross-border storefronts,
  Temu/Shein's aggressive conversion patterns (study the mechanics, reject the visual
  noise), Etsy and Back Market for how a marketplace makes an unknown seller feel safe, and
  one or two best-in-class editorial retailers for craft (Aesop, SSENSE, Nike, Glossier).
- **What actually converts, with evidence.** Baymard Institute is the strongest source —
  their 2025/2026 benchmarks report that 52% of desktop product pages, 58% of desktop
  product lists, and 67% of navigation implementations rate mediocre or worse. Their
  product-listing, category-navigation and homepage research is directly applicable. Look
  for the specific guidelines, not the headline stats.
- **2026 craft direction.** Editorial minimalism (generous whitespace, restrained type,
  product-as-hero), typography treated as brand infrastructure, purposeful
  micro-interactions at high-intent moments (add-to-cart, filter, checkout) rather than
  decorative motion, and the "dark glow" premium aesthetic — evaluate which of these
  actually serve a trust-constrained African cross-border marketplace and which are cargo
  cult. **Say which you're rejecting and why** in `RESEARCH.md`; that reasoning is as
  valuable as the plan.
- **Desktop-specific layout craft.** How wide-viewport retail actually uses 1440–1920px:
  fluid grids vs fixed columns, sticky filter rails, quick-view, hover-to-reveal secondary
  imagery, mega-menu vs flyout category navigation, density trade-offs.
- Anything you think we're missing. You are expected to have opinions we didn't ask for.

---

## 5. THE WORK — phased, in ROI order

**Phase order is deliberate: it is descending order of conversion impact per dollar spent.**
If you are stopped after Phase 3, the site should already be materially better. Do not
reorder to do the fun parts first.

Each phase = **one commit** + a `PROGRESS.md` update. Never leave a phase half-committed.

### Phase 0 — Orient, research, plan (no production code)

1. Run the resume check (§0.2).
2. Verify a handful of the §2 audit claims by spot-check (don't re-audit wholesale).
3. Do your research (§4) → write `RESEARCH.md`.
4. Write `PLAN.md`: your design thesis in a few paragraphs, then a phase-by-phase plan with
   concrete file lists. **Where you disagree with the phasing below, say so in `PLAN.md`
   and justify it** — you have better information than this brief does by that point.
5. Write the initial `PROGRESS.md`.
6. Create the branch. Commit the three docs.

**Design thesis prompt to answer in `PLAN.md`:** what is HB's visual point of view? "Green
Material-ish e-commerce site" is not one. Something like *"the trusted trade corridor"* —
the route, the border, the handover, the arrival — is a thesis that the radial nav's orbital
geometry, the ZA→NA journey, and the existing palette can all express coherently. Find one
that is better than that, or take it.

### Phase 1 — The token foundation

Everything downstream depends on this, and it is the single highest-leverage change.

- Extend `:root` into a real system: colour (existing hues plus tints/shades and semantic
  aliases), spacing scale, radius scale, **elevation scale**, motion durations and easing
  curves (including the radial nav's spring, promoted to a shared token), z-index scale,
  container widths, and **breakpoint variables**.
- Reconcile the type scale: pick the real scale, fix the ~20-value drift, and use fluid type
  (`clamp()`) where it earns its place.
- Add a **dark theme** derived from the same brand hues, driven by `prefers-color-scheme`
  with a `[data-theme]` override hook. SSR-safe: CSS-only, no JS theme detection on the
  server path.
- Update `docs/design/DESIGN.md` to match, in this same commit.

Migrating every component to the new tokens is a *later* phase — Phase 1 is the system plus
enough migration that nothing regresses visually.

### Phase 2 — Desktop navigation and the desktop shell

The largest structural gap. Give desktop a real information architecture.

- Category navigation in the header (flyout or mega-menu — your call, justify it), because
  right now there is none.
- A persistent, prominent desktop search — search is a primary conversion path and is
  currently an icon button.
- Rethink the 768px cliff: introduce genuine `1024` / `1280` / `1440`+ tiers.
- Fix the 768–1280px dead zone where the header is nearly empty.
- Establish the desktop page shell: container strategy, how wide viewports are used, whether
  content is centred or uses asymmetric/rail layouts.
- Keep the mobile radial nav intact, and make the desktop nav feel like its sibling.

### Phase 3 — The storefront (`/shop`) and product presentation

- Rebuild the hero as a real, fast, high-conviction hero. The photography already exists at
  `apps/web/public/images/hero-import-shopping-*` — use it, or argue for better art
  direction and note what assets we'd need. Preserve `srcset`, explicit dimensions and LCP
  discipline.
- **Product card, top to bottom.** This component appears on `/shop`, `/discover`,
  `/wishlist` and vendor storefronts — it is the highest-traffic component in the app.
  Fluid width instead of fixed. Vendor name. Sale/compare-at price. Stock and urgency
  states. Hover behaviour worth having on desktop. Design the rating slot now and leave it
  gracefully absent (see §2.6 — it needs an API change we are not making here).
- Product grids that actually use wide viewports (fluid `auto-fill` / `minmax`, more than
  four columns above ~1600px).
- The category grid, vendor showcase, trust banner and newsletter sections are all currently
  generic. Make them carry the design thesis.

### Phase 4 — Trust, states, and perceived performance

This is where the Namibian-market conversion barrier is actually addressed.

- **Skeleton loading states** for every async surface, replacing the hourglass-and-text
  pattern. This is the cheapest large win in perceived quality on a slow connection.
- Empty states and error states that recover — a route forward, not a dead end.
- Elevate the cross-border trust story: landed cost transparency, delivery windows, customs
  handling, returns, payment security. Currently these are buried or absent; they should be
  visible at the moments of doubt (card → PDP → cart → checkout).
- Micro-interactions at high-intent moments only: add-to-cart confirmation, wishlist toggle,
  filter application, checkout step progression. Purposeful, and
  `prefers-reduced-motion`-safe.

### Phase 5 — PDP, cart, checkout

The bottom of the funnel. Higher effort per screen, so it sits below the broad wins.

- PDP: gallery, the cross-border shipping card promoted from buried panel to reassurance
  moment, sizing UI, sticky add-to-cart on desktop, reviews given real presence.
- Cart: cost transparency (this is where cross-border surprise cost kills orders), clear
  progression to checkout.
- Checkout: single-page scroll pattern, minimal visible friction, security signalling. Do
  not restructure the checkout *logic* — this is a visual and trust pass.

### Phase 6 — Follow-ups you are NOT implementing

Write these to `PLAN.md` as proposed Trello cards, with enough detail that someone can pick
each one up:

- `ProductDto` rating fields (`averageRating`, `reviewCount`) so cards can show ratings —
  needs an API change in `apps/api` plus a `libs/shared` contract change.
- Any other API or data gap your design work exposed.
- Anything you designed for but couldn't complete within budget.

---

## 6. DEFINITION OF DONE — every phase

Before you mark a phase `DONE` in `PROGRESS.md`:

1. `npm run build` passes (shared → api → web).
2. `npm run test -w @hb/web` passes. Update tests you broke; add tests where you added
   testable component logic.
3. **SSR still renders.** Any browser API you touched is `isPlatformBrowser`-guarded.
4. Accessibility not regressed: contrast holds in both themes, focus states visible, ARIA
   intact, reduced motion respected.
5. No horizontal overflow at 360 / 414 / 768 / 1024 / 1280 / 1440 / 1920px.
6. `docs/design/DESIGN.md` updated if tokens changed.
7. Committed, Conventional Commit, with the `Co-Authored-By` trailer.
8. `PROGRESS.md` updated with status, files, SHA, decisions, and the next action.

**Verify visually — do not ask the human to check.** Use the browser preview tooling to run
the dev server and screenshot the affected screens at both mobile and desktop widths, in
both themes. Reference the evidence in `PROGRESS.md`.

---

## 7. HOW TO EXERCISE JUDGEMENT

This brief is deliberately strict about **process** (checkpoints, commits, budget) and
**constraints** (palette identity, tokens, SSR, accessibility, never merging to main). It is
deliberately *not* prescriptive about the design itself.

Do not treat the phase descriptions as a spec to implement literally. They are a
prioritisation, and the reasoning behind them is in §1 and §2. If your research leads you
somewhere better, go there — write the disagreement and the reasoning into `PLAN.md` first,
then build the better thing.

The bar: **someone who has never heard of HB should land on the desktop storefront and
believe it is a real, safe, well-funded platform they can hand their card details to** — and
should find it distinctive enough to remember. Right now it clears neither.

Do not ask for permission to start. Begin at §0.2.
