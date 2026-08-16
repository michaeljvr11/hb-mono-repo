# Brand asset pipeline — decision record

**Status:** accepted · **Date:** 2026-08-15 · **Scope:** the marketing brand assets
migrated from `hb-landing` by LSM-1

LSM-1 copied hb-landing's brand assets into `apps/web/public/` verbatim. They totalled
**6.24 MB** across five files, and the worst of them shipped on every route in the app.
This note records how they are now produced and why.

## Decision 1 — a checked-in re-encode, not a build-time pipeline

Optimization happens **once, ahead of time**, and the results are committed. It is
deliberately **not** part of `npm run build`.

- Pristine originals live in `apps/web/brand-assets/` — outside `public/`, so the Angular
  builder (`assets: [{ glob: "**/*", input: "public" }]`) never ships them.
- `scripts/optimize-brand-assets.py` reads those originals and writes the web-ready
  derivatives into `apps/web/public/`.
- Because it always reads the pristine originals, re-running is idempotent — it will not
  stack lossy generations on top of each other.

Why not build-time:

- **These assets change roughly never.** They are five brand images behind a marketing
  page, not user-uploaded content. Paying an encode cost on every CI build, forever, to
  re-derive identical bytes is a bad trade.
- **The alternative costs a native toolchain.** `sharp` is the usual choice; it pulls a
  platform-specific binary into every `npm install` — for developers, for CI, and for the
  API workspace that has no use for it.
- **Committed bytes are reviewable.** The exact files that reach production show up in the
  PR and are diffable, rather than being produced by a step that could silently change
  behaviour when a transitive encoder version bumps.
- **Angular has no built-in static-asset optimizer.** Files under `public/` are copied
  verbatim, so a build-time approach means owning a custom builder step, not enabling a flag.

The trade-off we accept: adding or changing a brand asset is a two-step job — drop the
original into `apps/web/brand-assets/`, re-run the script, commit both. That is written up
in the script's docstring. If this ever grows into user-uploaded imagery, this decision
should be revisited — that is a genuinely different problem calling for on-the-fly
resizing at the CDN or API edge.

## Decision 2 — native `<picture>`, not `NgOptimizedImage`

`NgOptimizedImage` (`ngSrc`) was evaluated and **rejected for this app's current
configuration**. Two blockers, both verified against the installed Angular 21.2 source:

1. **Its srcset generation requires an image loader, and we have none.** In
   `@angular/common`, `shouldGenerateAutomaticSrcset()` short-circuits on
   `this.imageLoader !== noopImageLoader`. No `IMAGE_LOADER` is provided anywhere in
   `apps/web`, so the noop loader is active and **no responsive srcset is emitted at all**.
   Hand-writing `ngSrcset` is not an escape hatch either — `assertNoNgSrcsetWithoutLoader`
   warns that without a loader it "would result in the same image being used for all
   configured sizes" and tells you to remove the attribute. The headline feature is
   unavailable until there is an image CDN in front of the app.
2. **It cannot emit `<picture>`, so WebP-with-fallback is impossible under it.** The
   directive drives a single `<img>` with one format.

What `NgOptimizedImage` would still have provided without a loader — `fetchpriority`,
eager/lazy defaults, and enforced `width`/`height` — are four plain HTML attributes, which
the heroes now set directly.

**This decision is configuration-dependent, not permanent.** If an image CDN is ever put in
front of `apps/web`, provide the matching loader and revisit: at that point
`NgOptimizedImage` generates srcsets for free and becomes the better tool.

## Decision 3 — the heroes moved from CSS backgrounds to real `<img>` elements

Previously the `/about` and `/services` heroes were CSS `background-image`s driven by a
custom property. They are now `<picture>` elements. Beyond being a precondition for
srcset, this fixes a real LCP problem: **a CSS background is invisible to the browser's
preload scanner.** It cannot start downloading until the stylesheet has been fetched and
parsed and the element matched — which is exactly the wrong behaviour for the LCP element
on a prerendered page aimed at mobile data.

The heroes are decorative — the `<h1>` carries the meaning — so they use `alt=""` and
`aria-hidden="true"`, and stay out of the accessibility tree.

## Encoding settings

| | setting | rationale |
|---|---|---|
| Heroes | WebP q80 + JPEG q80 fallback, widths 640/960/1280/1536 | q80 is the knee of the size/quality curve for this artwork (measured ~38 dB PSNR for the illustrations, ~34 dB for the photo); every hero sits under a ~50% dark overlay, which hides what little loss remains. Never upscaled past the source's own width. |
| Logo | 96×96, 32-colour palette PNG | A flat two-colour wordmark, so a small palette is lossless in practice. 96px covers its 32px (nav) and 28px (footer) render sizes at DPR 3. Kept as one file rather than a `<picture>` set — at 792 bytes, format negotiation would cost more markup than it saves. |

The JPEG fallbacks are retained despite WebP's near-universal support: they cost modern
visitors nothing (`<picture>` selects WebP and the JPEG is never fetched — verified) and
the target market has a long tail of older Android handsets.

The logo's 1:1 canvas and its transparent padding are preserved deliberately. Trimming
would change how large the mark reads inside the fixed 32px/28px box — a visual change,
which is out of scope for an asset-weight card.

## Results

Bytes actually delivered per page view, measured in-browser via the Resource Timing API
(`transferSize`, so gzip/brotli included):

| page | before | after — mobile @375px | reduction |
|---|---|---|---|
| `/about` | 2,581,227 B | 33,898 B | 98.7% |
| `/services` | 2,455,633 B | 35,542 B | 98.6% |
| every other route (logo only) | 902,325 B | 300 B | 99.97% |

At a 1280px desktop viewport `/about` measured 47,428 B — larger than mobile because the
browser steps up to the 1280w variant, which is the srcset working as intended.

On-disk footprint of `apps/web/public/` (what gets deployed, all variants of all five
assets): **6,387,700 B → 2,460,189 B**. That figure is dominated by the still-unreferenced
`hero-import-shopping` set (photographic content compresses far less than the flat
illustrations); no single page view downloads more than one variant of one hero.
