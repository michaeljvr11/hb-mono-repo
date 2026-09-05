import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CountryCode, ProductDto } from '@hb/shared';
import { formatPrice } from '../../format-price';
import { buildResponsiveImage } from '../../responsive-image';

export type ProductCardVariant = 'grid' | 'carousel';

/**
 * Listing fields the card already knows how to render but which the API does
 * not return yet (PLAN §5 cards 1 and 2). Kept local to the card on purpose —
 * `@hb/shared` changes when the API grows them, and this widening is deleted
 * then. Any `ProductDto` is assignable, so no consumer has to change.
 */
export interface ProductListingExtras {
  /** Mean review score, 0–5. */
  averageRating: number;
  /** Number of reviews behind `averageRating`; the rating hides at 0. */
  reviewCount: number;
  /** Pre-discount price in the product's currency; must exceed `price` to show. */
  compareAtPrice: number;
}

export type ProductCardProduct = ProductDto & Partial<ProductListingExtras>;

export type StockState = 'in-stock' | 'low' | 'sold-out';

/** "Only N left" kicks in at or below this many units (across all sizes). */
export const LOW_STOCK_MAX = 5;

/** How long the add-to-cart button holds its "added" (check icon) state. */
const ADDED_STATE_MS = 900;
/** How long the wishlist heart holds its pop class — one `--hb-duration-slow` plus slack. */
const WISHLIST_POP_MS = 400;

const COUNTRY_NAMES: Record<string, string> = {
  [CountryCode.SOUTH_AFRICA]: 'South Africa',
  [CountryCode.NAMIBIA]: 'Namibia',
};

/**
 * Presentational product tile used across the storefront (carousel), product
 * discovery (grid) and any other listing surface. Card body click navigates
 * to the PDP; the add-to-cart affordance stops propagation so it never
 * double-fires the navigation.
 *
 * Fluid: the card fills whatever track its parent grid gives it
 * (`.hb-product-grid` in `styles.scss`, or the storefront carousel's
 * `grid-auto-columns`). It never sets its own width.
 */
@Component({
  selector: 'app-product-card',
  imports: [RouterLink],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCard {
  private readonly destroyRef = inject(DestroyRef);

  readonly product = input.required<ProductCardProduct>();
  readonly variant = input<ProductCardVariant>('grid');
  readonly wishlisted = input(false);

  readonly addToCart = output<ProductDto>();
  readonly wishlistToggle = output<ProductDto>();

  /** True for `ADDED_STATE_MS` after a successful quick-add click: spring scale + check icon. */
  readonly justAdded = signal(false);
  /** True for `WISHLIST_POP_MS` after a heart click: the spring pop. */
  readonly wishlistPopping = signal(false);

  private addedTimer: ReturnType<typeof setTimeout> | null = null;
  private popTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.addedTimer) clearTimeout(this.addedTimer);
      if (this.popTimer) clearTimeout(this.popTimer);
    });
  }

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

  /**
   * The first image that is not the primary — cross-fades in on desktop hover.
   * `null` for single-image (and image-less) products, so the hover is a no-op there.
   */
  readonly secondaryImage = computed(() => {
    const primary = this.primaryImageEntry();
    const images = this.product().images ?? [];
    if (!primary || images.length < 2) return null;
    const alt = [...images]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .find((i) => i.id !== primary.id);
    return alt ? buildResponsiveImage(alt) : null;
  });

  readonly imageAlt = computed(() => {
    const product = this.product();
    return this.primaryImageEntry()?.altText ?? product.name;
  });

  /**
   * Rendered card width per variant. Grid: one of two columns on phones, then a
   * ~200–220px track (`.hb-product-grid`). Carousel: the storefront track's
   * `grid-auto-columns` (170px, 220px from 768px — `shop.scss`).
   */
  readonly imageSizes = computed(() =>
    this.variant() === 'carousel' ? '(min-width: 768px) 220px, 170px' : '(min-width: 768px) 220px, 50vw',
  );

  readonly categoryLabel = computed(() => this.product().categories?.[0]?.name ?? null);

  /** Drives the "Sizing available" hint badge — a property of the card itself,
   *  shown everywhere it renders (discovery grid, PDP related grid, vendor storefront). */
  readonly hasSizes = computed(() => (this.product().sizes?.length ?? 0) > 0);

  // ── Seller identity ───────────────────────────────────────────────────────

  /** Marketplace listings name the vendor; platform (first-party) listings are sold by H&B. */
  readonly isPlatformListing = computed(() => !this.product().vendor);

  readonly sellerName = computed(() => this.product().vendor?.businessName ?? 'Sold by H&B');

  /** Two-letter origin chip; the full country name goes on the tooltip / label. */
  readonly originCode = computed(() => this.product().originCountry);

  readonly originLabel = computed(() => {
    const code = this.originCode();
    return `Ships from ${COUNTRY_NAMES[code] ?? code}`;
  });

  // ── Stock ─────────────────────────────────────────────────────────────────

  /** Units on hand: the sum across sizes for sized products, else the product's own count. */
  readonly stockTotal = computed(() => {
    const product = this.product();
    if (product.sizes?.length) {
      return product.sizes.reduce((sum, size) => sum + Math.max(0, size.stockQuantity), 0);
    }
    return Math.max(0, product.stockQuantity);
  });

  readonly stockState = computed<StockState>(() => {
    const total = this.stockTotal();
    if (total <= 0) return 'sold-out';
    if (total <= LOW_STOCK_MAX) return 'low';
    return 'in-stock';
  });

  readonly stockLabel = computed(() => {
    switch (this.stockState()) {
      case 'sold-out':
        return 'Sold out';
      case 'low':
        return `Only ${this.stockTotal()} left`;
      default:
        return 'In stock';
    }
  });

  readonly soldOut = computed(() => this.stockState() === 'sold-out');

  // ── Rating (no-op until the API returns the fields — PLAN §5 card 1) ───────

  readonly rating = computed(() => {
    const { averageRating, reviewCount } = this.product();
    if (typeof averageRating !== 'number' || !Number.isFinite(averageRating)) return null;
    if (reviewCount !== undefined && reviewCount <= 0) return null;
    return {
      value: Math.round(averageRating * 10) / 10,
      count: reviewCount ?? null,
    };
  });

  // ── Price + sale slot (no-op until `compareAtPrice` ships — PLAN §5 card 2) ─

  readonly price = computed(() => {
    const product = this.product();
    return formatPrice(product.price, product.currency);
  });

  readonly onSale = computed(() => {
    const { compareAtPrice, price } = this.product();
    return typeof compareAtPrice === 'number' && compareAtPrice > price;
  });

  readonly compareAtPrice = computed(() => {
    const product = this.product();
    return this.onSale() ? formatPrice(product.compareAtPrice as number, product.currency) : null;
  });

  readonly discountPercent = computed(() => {
    const { compareAtPrice, price } = this.product();
    if (!this.onSale()) return null;
    return Math.round((1 - price / (compareAtPrice as number)) * 100);
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  readonly cartButtonLabel = computed(() => {
    const name = this.product().name;
    if (this.soldOut()) return `${name} is sold out`;
    if (this.hasSizes()) return `Select a size for ${name}`;
    return `Add ${name} to cart`;
  });

  readonly cartButtonIcon = computed(() => {
    if (this.justAdded()) return 'check';
    if (this.hasSizes()) return 'straighten';
    return this.variant() === 'carousel' ? 'add' : 'add_shopping_cart';
  });

  onAddToCart(event: Event): void {
    if (this.hasSizes()) {
      // A card-level quick-add can't collect a size choice inline, and the
      // API rejects an add-to-cart without one for a sized product — rather
      // than dead-ending the customer, let the click fall through to the
      // card's own routerLink and route to the PDP, where the size selector
      // lives (see product-detail.ts).
      return;
    }
    // Prevent the click from bubbling into the card's own routerLink navigation.
    event.stopPropagation();
    event.preventDefault();
    if (this.soldOut()) return;
    this.addToCart.emit(this.product());
    this.justAdded.set(true);
    if (this.addedTimer) clearTimeout(this.addedTimer);
    this.addedTimer = setTimeout(() => this.justAdded.set(false), ADDED_STATE_MS);
  }

  onWishlistToggle(event: Event): void {
    // Prevent the click from bubbling into the card's own routerLink navigation.
    event.stopPropagation();
    event.preventDefault();
    this.wishlistToggle.emit(this.product());
    this.wishlistPopping.set(true);
    if (this.popTimer) clearTimeout(this.popTimer);
    this.popTimer = setTimeout(() => this.wishlistPopping.set(false), WISHLIST_POP_MS);
  }
}
