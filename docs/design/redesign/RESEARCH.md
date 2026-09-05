# RESEARCH — HB Storefront Overhaul

> Written in Phase 0 (2026-09-05) after 13 web lookups. **Do not repeat this research.**
> Append only if a later phase learns something that changes a decision.

## 1. Audit verification (spot-checks against BRIEF §2)

All §2 claims verified; two counts have drifted upward since the brief was written
(commit `faaeed0`, "styling updates to nav bar and footer", landed after the audit):

| Claim | Brief | Measured 2026-09-05 |
|---|---|---|
| `:root` colour tokens | 17 + 1 | 17 + `--hb-radius-pill` ✔ |
| SCSS lines | 15,171 | 15,171 ✔ |
| `768px` occurrences | 58 | 66 |
| `1024px` / `1280px` | 7 / 3 | 7 / 23 (nav-bar rewrite added many) |
| `1440px` | — | 0 |
| `max-width: 1280px` containers | 13 | 13 ✔ |
| Distinct `font-size` px values | 20 | 20 (10,11,12,13,14,15,16,18,20,22,24,26,28,30,32,36,40,48,56,72) |
| Distinct `box-shadow` values | ~20 | 22 |
| `prefers-color-scheme` usage | none | 0 files ✔ |
| Hourglass loading pattern | everywhere | 23 templates; `.state-message` defined per-feature in shop, discover, product-detail, vendor-profile |
| Product card fixed width | 260/280/160 | ✔ `product-card.scss:6,17,26` |
| Shop grid caps at 4 cols | ✔ | `shop.scss:261-265` `repeat(2)` → `repeat(4)` @1024 |
| Desktop header has no categories | ✔ | `nav-bar.html`: brand, Sell, currency, 4 icons only; search icon just routes to `/discover` |

Useful facts the brief didn't record:

- **Radial nav motion to promote to tokens:** items `cubic-bezier(0.34, 1.56, 0.64, 1)`
  (overshoot spring) 0.5s; disc `cubic-bezier(0.22, 1, 0.36, 1)` 0.55s; pulse 2.6s ease-out.
- Fonts loaded: Inter 400/500/600/700/800; Material Symbols Outlined variable axis.
- `CategoryDto` has `parentId?` and `displayOrder` → a hierarchy is *possible*; whether seed
  data uses parents is unverified (check in Phase 2 via `GET /categories`).
- `ProductDto` has `stockQuantity`, `originCountry`, `listingType` (platform | vendor),
  `vendor?.businessName`, `sizes[].stockQuantity`. So **vendor name, stock/urgency state,
  "ships from ZA", and platform-vs-marketplace badge are styling-only.** It has **no**
  `compareAtPrice`, no rating fields, no lead-time. Those are API follow-ups (PLAN §6).
- Product card already has: `srcset` image, wishlist toggle, category label, size hint,
  price, add-to-cart. `variant: 'grid' | 'carousel'`.
- Feature sizes: PDP is the giant (588 html / 1055 scss / 726 ts). Checkout 301/521/338.
  Nav-bar scss is 503 lines after the last commit.
- Preview: `.claude/launch.json` has `web (Angular SSR dev server)` on 4200 and
  `api (NestJS, watch mode)` on 3000.

## 2. Market & audience evidence

### 2.1 Namibian trust barriers (TransUnion Consumer Pulse 2025; New Era)
- Cyber threats most feared: **payment/card fraud 59%**, stolen identity 54%, data breach 31%.
- 47% cite identity theft as a barrier to adopting new digital services.
- **35% of Namibians who lost money to digital fraud lost it to third-party seller scams on
  legitimate e-commerce sites.** Losses happen *inside* credible-looking platforms, so a
  marketplace must prove *each seller* is real, not just the platform.
- What drives trust: **personal-data security 89% "very important"**, easy payment 81%,
  easy login 76%.
- Highest-risk touchpoint is **account creation (2.8% suspected fraud)**: register is a trust
  moment, not a form.

**Design consequences:** vendor identity on cards and PDP (name, fulfilment type, origin,
verified slot); payment-security signalling at cart/checkout (lock, provider marks, "card
details never touch HB" if true); platform-vs-vendor fulfilment made explicit everywhere;
buyer-protection statement only if it is actually policy (open question §6.1).

### 2.2 Connectivity (DataReportal Digital 2025 Namibia; MTC; 2023 census)
- Internet penetration 64.4%; 87% mobile connections per capita; 43.8% rural.
- 12% lack 4G; Kunene 49% coverage. 1GB ≈ US$10 (2022), among Africa's most expensive.
- Smartphone ownership 28.5% (census 2023): the addressable buyer is urban, phone-first, and
  pays dearly per byte.

**Design consequences:** no hero video; hero image ≤ ~120KB WebP at 1280w with
`fetchpriority="high"`; lazy-load below the fold; skeletons matter more here than anywhere;
no decorative imagery in category tiles unless it earns its bytes.

### 2.3 Cross-border cost anxiety (Baymard cart abandonment; Passport 2026 intl checkout)
- ~70% average cart abandonment; **#1 stated reason: unexpected extra costs** (shipping,
  taxes, duties). Cross-border adds duties, customs timelines, payment uncertainty.
- Up-front landed cost is the strongest documented lever for international checkout.
- ZA→NA is inside SACU with a 1:1 peg: **no duty surprise, no FX surprise.** HB has a
  structural advantage that the site currently never states. It should be the headline claim.

## 3. Conversion evidence (Baymard)

### 3.1 Product list items: the five mandatory attributes
Price (always visible), title/type, thumbnail, **rating average AND count**, variations.
50% of sites get listing information wrong; 58% of desktop product lists rate mediocre or
worse. Add 1–3 category-specific attributes on the card (e.g. size range, "ships from ZA").
- Ratings need an API change here → design the slot, ship without it.
- Rating **count** matters as much as the average.

### 3.2 Navigation
- Hover mega-menus are the main nav on ~88% of top US e-commerce sites.
- **Hover delay 300–500ms** required; 60% of sites fail it and flicker.
- Keep total menu links ≲ 28–36; >50 links raises nav-area bounce ~34%.
- Drop-downs must show hierarchy and let users traverse *up* (parent is itself a link).
- 67% of navigation implementations rate mediocre or worse: plain and correct wins.

### 3.3 Loading states
- Skeletons are perceived 20–30% faster than spinners at identical latency and rank best on
  emotional response (one contrary study, Viget 2017). Use skeletons for lists/cards;
  spinners only for indeterminate button-level actions.

### 3.4 Wide viewports
- Fluid grid with a `max-width` cap; **don't fill 1920px+ edge-to-edge**. Optimise column
  count per tier rather than maximising it.

## 4. Reference sites (prior knowledge; no budget spent fetching)

| Site | Take | Reject |
|---|---|---|
| **Takealot** | Department rail + mega-menu; "Ships in X days" on card; concrete promo language ("Save R120") | Banner clutter |
| **Superbalist / Zando** | Editorial hero, product-as-hero, full-bleed category tiles with restrained type | Fashion whitespace that hides price |
| **Temu / Shein** | Honest versions of urgency: stock counters when true | Fake urgency, flashing, coupon spam: destroys trust for a fraud-wary audience |
| **Etsy** | Seller block on card + PDP (shop name, star seller, review count); "ships from" | — |
| **Back Market** | Trust strip at hero level (warranty, returns, secure payment); calm badges; explicit condition states | — |
| **Amazon cross-border** | "Import Fees Deposit" line in cart: the honesty pattern | Density |
| **Aesop / SSENSE** | Typographic restraint, few weights, photography that breathes | Luxury austerity reads "expensive" to a value-seeking market |
| **Nike** | Fluid grid with density toggle; sticky filter rail; hover to second image | — |

## 5. 2026 craft direction: accepted and rejected

**Accept**
- **Editorial minimalism, adapted.** Fewer type sizes, more rhythm, product-as-hero. Not
  luxury austerity: price stays large and permanent, trust chips stay visible.
- **Typography as infrastructure.** One family (Inter, already loaded), a 9-step fluid scale,
  tight tracking only at display sizes. No serif headings: they read "boutique" and our claim
  is "infrastructure".
- **Purposeful micro-interaction at high-intent moments** (add-to-cart, wishlist, filter
  apply, checkout step), using the radial nav's spring so the site has one motion signature.
- **Dark theme** derived from the brand hues, CSS-only. Real value on OLED phones at night and
  a cheap "this is a real product" signal.

**Reject**
- **"Dark glow" neon-on-black.** Reads as crypto/gaming; this audience's trust reference is a
  bank or a courier. Dark theme yes, glow no.
- **Hero video, parallax, scroll-jacking.** Data cost and LCP.
- **Urgency theatre** (countdowns, fake viewer counts). Honest stock states only.
- **Serif editorial headings.** See above.
- **Glassmorphism / heavy blur.** GPU cost on low-end Android, contrast risk.
- **Bento-grid homepage.** Fights the primary job: get to products fast.
- **Density toggle.** Not before the grid is fluid at all.

## 6. Open questions surfaced (for the owner; not blocking)

1. Does HB hold buyer payment until delivery? If yes, it is the strongest trust line we can
   print. If no, do not imply it.
2. Is there a verified-vendor flag in the data model? Check `VendorDto` in Phase 3 before
   designing the badge as anything but a slot.
3. Delivery-window data: per-product/vendor lead time, or a static policy string? Determines
   whether "Ships in 2–4 days" is data or copy.
4. Is there a short canonical returns summary we can surface at PDP/cart without legal review?
