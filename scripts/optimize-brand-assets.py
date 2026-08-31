#!/usr/bin/env python3
"""Re-encode the marketing brand assets into the web-ready files under apps/web/public.

This is a **one-off / on-demand** tool, deliberately NOT wired into `npm run build`.
See docs/design/BRAND-ASSET-PIPELINE.md for the reasoning.

Inputs  : apps/web/brand-assets/   (pristine originals, never shipped)
Outputs : apps/web/public/         (shipped verbatim by the Angular builder)

Because it always reads the pristine originals it is idempotent — re-running it
will not stack lossy generations on top of each other.

Prerequisite: Pillow (`pip install Pillow`). Not a repo dependency; adding a native
image toolchain to every `npm install` is not worth it for assets that change
roughly never.

Usage (from the repo root):
    python scripts/optimize-brand-assets.py
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - developer convenience
    sys.exit("Pillow is required: pip install Pillow")

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = REPO_ROOT / "apps" / "web" / "brand-assets"
PUBLIC_DIR = REPO_ROOT / "apps" / "web" / "public"

# Candidate widths for the full-bleed (100vw) marketing heroes. Widths at or above
# an image's intrinsic width are dropped and replaced by the intrinsic width, so we
# never upscale — an upscaled variant costs bytes and adds no detail.
HERO_WIDTHS = (640, 960, 1280, 1536)

# Quality 80 sits at the knee of the size/PSNR curve for this artwork (measured:
# ~38dB for the illustrations, ~34dB for the photo) and every hero is composited
# under a ~50% dark overlay, which hides what little loss remains.
WEBP_QUALITY = 80
JPEG_QUALITY = 80

# The logo renders at 44px (nav) and 40px (footer); 144px covers up to 48px at
# DPR 3, with headroom above both.
LOGO_SIZE = 144
# It is a flat two-colour wordmark, so a small palette is lossless in practice.
LOGO_PALETTE_COLORS = 32


def hero_widths(intrinsic_width: int) -> list[int]:
    """Widths to emit for a hero, never exceeding the source's own resolution."""
    widths = [w for w in HERO_WIDTHS if w < intrinsic_width]
    cap = min(max(HERO_WIDTHS), intrinsic_width)
    if cap not in widths:
        widths.append(cap)
    return widths


def encode_hero(name: str, out_stem: str) -> list[tuple[Path, int]]:
    """Emit WebP + JPEG variants for one hero. Returns (path, bytes) per file."""
    source = Image.open(SOURCE_DIR / name).convert("RGB")
    written: list[tuple[Path, int]] = []

    for width in hero_widths(source.width):
        height = round(source.height * width / source.width)
        resized = source.resize((width, height), Image.LANCZOS)

        webp_path = PUBLIC_DIR / "images" / f"{out_stem}-{width}.webp"
        resized.save(webp_path, "WEBP", quality=WEBP_QUALITY, method=6)

        # Progressive + 4:2:2 chroma: better perceived load on slow links, and 4:2:2
        # keeps the crisp "H&B" lettering in the illustrations from smearing.
        jpeg_path = PUBLIC_DIR / "images" / f"{out_stem}-{width}.jpg"
        resized.save(
            jpeg_path,
            "JPEG",
            quality=JPEG_QUALITY,
            optimize=True,
            progressive=True,
            subsampling=1,
        )

        written += [(webp_path, webp_path.stat().st_size), (jpeg_path, jpeg_path.stat().st_size)]

    return written


def encode_logo() -> list[tuple[Path, int]]:
    """Emit the single small palette PNG used by the nav bar and footer."""
    source = Image.open(SOURCE_DIR / "hb-logo.png")
    # The 1:1 canvas (and its transparent padding) is preserved deliberately — the
    # nav/footer CSS sizes a square box, and trimming would change how large the
    # mark reads inside it.
    resized = source.resize((LOGO_SIZE, LOGO_SIZE), Image.LANCZOS)
    quantized = resized.quantize(colors=LOGO_PALETTE_COLORS, method=Image.FASTOCTREE)

    out = PUBLIC_DIR / "logos" / "hb-logo.png"
    quantized.save(out, "PNG", optimize=True)
    return [(out, out.stat().st_size)]


HEROES = {
    "about-puzzle-pieces.png": "about-puzzle-pieces",
    "services-shopping-cart.png": "services-shopping-cart",
    "hero-import-shopping.jpg": "hero-import-shopping",
    "contact-hero-image.jpg": "contact-hero-image",
}


def main() -> int:
    (PUBLIC_DIR / "images").mkdir(parents=True, exist_ok=True)
    (PUBLIC_DIR / "logos").mkdir(parents=True, exist_ok=True)

    written: list[tuple[Path, int]] = encode_logo()
    for name, stem in HEROES.items():
        written += encode_hero(name, stem)

    total = 0
    for path, size in sorted(written):
        total += size
        print(f"{size:>9,} B  {path.relative_to(REPO_ROOT).as_posix()}")

    source_total = sum(p.stat().st_size for p in SOURCE_DIR.iterdir() if p.is_file())
    print(f"\n{'sources:':>12} {source_total:>10,} B")
    print(f"{'generated:':>12} {total:>10,} B")
    print(f"{'reduction:':>12} {100 * (1 - total / source_total):>9.1f} %")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
