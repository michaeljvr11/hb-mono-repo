import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Skeleton } from '../skeleton/skeleton';
import type { ProductCardVariant } from './product-card';

/**
 * Loading twin of `<app-product-card>`: the same box, image ratio and body
 * rhythm, so the grid does not reflow when real cards replace it. Drop one
 * per expected card inside the same `.hb-product-grid` (or carousel track)
 * the real cards will use.
 */
@Component({
  selector: 'app-product-card-skeleton',
  imports: [Skeleton],
  template: `
    <div class="product-card-skeleton" [class.product-card-skeleton--carousel]="variant() === 'carousel'">
      <app-skeleton class="product-card-skeleton__image" />
      <div class="product-card-skeleton__body">
        <app-skeleton shape="text" width="40%" height="12px" />
        <app-skeleton shape="text" width="90%" height="16px" />
        <app-skeleton shape="text" width="65%" height="16px" />
        <app-skeleton shape="text" width="55%" height="12px" />
        <div class="product-card-skeleton__footer">
          <app-skeleton shape="text" width="45%" height="20px" />
          <app-skeleton shape="circle" width="36px" height="36px" />
        </div>
      </div>
    </div>
  `,
  styleUrl: './product-card-skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardSkeleton {
  readonly variant = input<ProductCardVariant>('grid');
}
