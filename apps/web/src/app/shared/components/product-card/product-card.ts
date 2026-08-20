import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductDto } from '@hb/shared';
import { formatPrice } from '../../format-price';
import { buildResponsiveImage } from '../../responsive-image';

export type ProductCardVariant = 'grid' | 'carousel';

/**
 * Presentational product tile used across the storefront (carousel), product
 * discovery (grid) and any other listing surface. Card body click navigates
 * to the PDP; the add-to-cart affordance stops propagation so it never
 * double-fires the navigation.
 */
@Component({
  selector: 'app-product-card',
  imports: [RouterLink],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCard {
  readonly product = input.required<ProductDto>();
  readonly variant = input<ProductCardVariant>('grid');
  readonly wishlisted = input(false);

  readonly addToCart = output<ProductDto>();
  readonly wishlistToggle = output<ProductDto>();

  /** The image to render for this card: primary if flagged, else the first. */
  private readonly primaryImageEntry = computed(() => {
    const images = this.product().images;
    if (!images?.length) return null;
    return images.find((i) => i.isPrimary) ?? images[0] ?? null;
  });

  /** `srcset`/`sizes`-ready attrs for the primary image, or `null` when the product has none. */
  readonly primaryImage = computed(() => {
    const image = this.primaryImageEntry();
    return image ? buildResponsiveImage(image) : null;
  });

  readonly imageAlt = computed(() => {
    const product = this.product();
    return this.primaryImageEntry()?.altText ?? product.name;
  });

  /** Rendered card width per variant (`product-card.scss`) — grid: 260px, 280px from 768px; carousel: fixed 160px. */
  readonly imageSizes = computed(() =>
    this.variant() === 'carousel' ? '160px' : '(min-width: 768px) 280px, 260px',
  );

  readonly categoryLabel = computed(() => this.product().categories?.[0]?.name ?? null);

  readonly price = computed(() => {
    const product = this.product();
    return formatPrice(product.price, product.currency);
  });

  onAddToCart(event: Event): void {
    // Prevent the click from bubbling into the card's own routerLink navigation.
    event.stopPropagation();
    event.preventDefault();
    this.addToCart.emit(this.product());
  }

  onWishlistToggle(event: Event): void {
    // Prevent the click from bubbling into the card's own routerLink navigation.
    event.stopPropagation();
    event.preventDefault();
    this.wishlistToggle.emit(this.product());
  }
}
