import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductDto } from '@hb/shared';
import { formatPrice } from '../../format-price';

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

  readonly primaryImage = computed(() => {
    const images = this.product().images;
    if (!images?.length) return null;
    const primary = images.find((i) => i.isPrimary);
    return primary?.url ?? images[0]?.url ?? null;
  });

  readonly imageAlt = computed(() => {
    const product = this.product();
    const primary = product.images?.find((i) => i.isPrimary) ?? product.images?.[0];
    return primary?.altText ?? product.name;
  });

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
