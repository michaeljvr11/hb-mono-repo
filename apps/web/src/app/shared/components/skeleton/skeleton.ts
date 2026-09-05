import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type SkeletonShape = 'rect' | 'text' | 'circle';

/**
 * Loading placeholder primitive (PLAN Phase 3, rolled out site-wide in Phase 4).
 *
 * One shimmering block; compose several into the shape of the content that is
 * about to arrive (see `<app-product-card-skeleton>`). Purely decorative — it is
 * `aria-hidden` and the *container* that swaps it for real content is what
 * carries `role="status"` and the visually-hidden "Loading…" text.
 *
 * - `rect` (default): radius `--hb-radius-sm`; give it a `width`/`height` or an
 *   `aspect-ratio` from the parent.
 * - `text`: one line of copy — `height` defaults to `1em`, radius `--hb-radius-xs`.
 * - `circle`: `border-radius: 50%`; pass one size for both dimensions.
 *
 * The shimmer runs on `--hb-duration-slower × 3` and stops under reduced motion
 * (the duration tokens collapse to 0, and a 0s animation paints its first frame).
 */
@Component({
  selector: 'app-skeleton',
  template: '',
  styleUrl: './skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[class]': '"skeleton skeleton--" + shape()',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
  },
})
export class Skeleton {
  readonly shape = input<SkeletonShape>('rect');
  /** Any CSS length; defaults to the full width of the parent. */
  readonly width = input<string>('100%');
  /** Any CSS length; `text` falls back to `1em`, the others to `auto` (set an aspect-ratio or height from the parent). */
  readonly height = input<string | null>(null);
}
