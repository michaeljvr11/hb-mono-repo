import { isPlatformBrowser, Location } from '@angular/common';
import {
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AnalyticsEventType, ProductDto } from '@hb/shared';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/api/cart.service';
import { WishlistService } from '../../core/api/wishlist.service';
import { ProductsService } from '../../core/api/products.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { formatPrice } from '../../shared/format-price';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { ProductCard } from '../../shared/components/product-card/product-card';
import { RadialNav } from '../../shared/components/radial-nav/radial-nav';

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

/** Number of related products shown in "You May Also Like". */
const RELATED_LIMIT = 4;

/**
 * Product detail page (PDP). Fetches the product by the `:id` route param
 * (works during SSR — plain HttpClient relative URL, same pattern as every
 * other public catalogue service). A 404 from the API renders a friendly
 * not-found state rather than propagating the error.
 */
@Component({
  selector: 'app-product-detail',
  imports: [NavBar, Footer, ProductCard, RadialNav, RouterLink],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss',
})
export class ProductDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly productsService = inject(ProductsService);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly wishlistService = inject(WishlistService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly gaService = inject(GoogleAnalyticsService);
  private readonly notificationService = inject(NotificationService);
  private readonly platformId = inject(PLATFORM_ID);

  /** Real cart count for the radial-nav badge. */
  readonly cartCount = this.cartService.itemCount;

  // Hydration gate: server render and first client render must both show
  // empty hearts (no anonymous-vs-signed-in DOM mismatch) — see nav-bar.ts.
  // Gates every wishlist surface on this page: the sticky-bar heart, the
  // related-products grid hearts, and the radial-nav badge.
  private readonly hydrated = signal(false);

  /** True once hydrated and the product is on the signed-in user's wishlist. */
  readonly isWishlisted = (productId: string): boolean =>
    this.hydrated() && this.wishlistService.has(productId);

  /** Real wishlist count for the radial-nav badge — 0 until hydrated, same gate as isWishlisted. */
  readonly wishlistCount = computed(() =>
    this.hydrated() ? this.wishlistService.itemCount() : 0,
  );

  private readonly productId = toSignal(
    this.route.paramMap.pipe(switchMap((params) => [params.get('id')])),
    { initialValue: null },
  );

  readonly product = signal<ProductDto | null>(null);
  readonly state = signal<LoadState>('loading');

  readonly relatedProducts = signal<ProductDto[]>([]);

  // ── Image gallery ───────────────────────────────────────────────────────
  readonly activeImageIndex = signal(0);

  readonly images = computed(() => this.product()?.images ?? []);

  readonly activeImage = computed(() => {
    const imgs = this.images();
    return imgs[this.activeImageIndex()] ?? imgs[0] ?? null;
  });

  readonly hasMultipleImages = computed(() => this.images().length > 1);

  // ── Derived display data ─────────────────────────────────────────────────
  readonly priceLabel = computed(() => {
    const p = this.product();
    if (!p) return '';
    return formatPrice(p.price, p.currency);
  });

  readonly vendorInitials = computed(() => {
    const name = this.product()?.vendor?.businessName;
    if (!name) return '';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase();
  });

  constructor() {
    afterNextRender(() => {
      this.hydrated.set(true);
      // Prime the wishlist once per page load for signed-in users; toggles
      // elsewhere keep the shared WishlistService signal fresh.
      if (this.authService.isLoggedIn() && this.wishlistService.wishlist() === null) {
        this.wishlistService.load().subscribe({ error: () => undefined });
      }
    });

    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) {
        this.state.set('not-found');
        return;
      }
      this.loadProduct(id);
    });
  }

  private loadProduct(id: string): void {
    this.state.set('loading');
    this.activeImageIndex.set(0);
    this.productsService.getById(id).subscribe({
      next: (product) => {
        this.product.set(product);
        this.state.set('loaded');
        this.analyticsService.track(AnalyticsEventType.PRODUCT_VIEWED, {
          productId: product.id,
          vendorId: product.vendor?.id,
        });
        this.gaService.viewItem(product.id, product.name, product.price, product.currency);
        this.loadRelated(product);
      },
      error: (err) => {
        this.product.set(null);
        this.state.set(err?.status === 404 ? 'not-found' : 'error');
      },
    });
  }

  private loadRelated(product: ProductDto): void {
    const categoryId = product.categories?.[0]?.id;
    if (!categoryId) {
      this.relatedProducts.set([]);
      return;
    }
    this.productsService.list({ categoryId }).subscribe({
      next: (res) => {
        this.relatedProducts.set(
          res.items.filter((p) => p.id !== product.id).slice(0, RELATED_LIMIT),
        );
      },
      error: () => this.relatedProducts.set([]),
    });
  }

  // ── Gallery controls ─────────────────────────────────────────────────────

  nextImage(): void {
    const count = this.images().length;
    if (count <= 1) return;
    this.activeImageIndex.set((this.activeImageIndex() + 1) % count);
  }

  prevImage(): void {
    const count = this.images().length;
    if (count <= 1) return;
    this.activeImageIndex.set((this.activeImageIndex() - 1 + count) % count);
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  goBack(): void {
    if (isPlatformBrowser(this.platformId) && window.history.length > 1) {
      this.location.back();
      return;
    }
    void this.router.navigate(['/discover']);
  }

  viewStorefront(): void {
    const vendorId = this.product()?.vendor?.id;
    if (!vendorId) return;
    void this.router.navigate(['/vendors', vendorId]);
  }

  onAddToCart(): void {
    const product = this.product();
    if (!product) return;
    this.addProductToCart(product);
  }

  onRelatedAddToCart(product: ProductDto): void {
    this.addProductToCart(product);
  }

  /**
   * Shared anonymous gate for add-to-cart and wishlist actions: navigates to
   * `/login` with the current URL as `returnUrl` and returns `true` if the
   * caller must bail out; returns `false` for signed-in users.
   */
  private redirectAnonymous(): boolean {
    if (this.authService.isLoggedIn()) return false;
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
    return true;
  }

  private addProductToCart(product: ProductDto): void {
    if (this.redirectAnonymous()) return;
    this.cartService.addItem(product.id).subscribe({
      next: () => {
        this.analyticsService.track(AnalyticsEventType.ADD_TO_CART, {
          productId: product.id,
          vendorId: product.vendor?.id,
        });
        this.gaService.addToCart(product.id, product.name, product.price, product.currency);
        this.notificationService
          .success(`Added '${product.name}' to your cart.`, 'View cart')
          .onAction()
          .subscribe(() => void this.router.navigate(['/cart']));
      },
      error: (err: { error?: { message?: string } }) => {
        this.notificationService.error(err?.error?.message ?? 'Could not add this item to your cart.');
      },
    });
  }

  /** Wishlist toggle for the "You May Also Like" related-products grid. */
  onRelatedWishlistToggle(product: ProductDto): void {
    if (this.redirectAnonymous()) return;
    // No optimistic mutation — the heart only reflects a successful server
    // response (via WishlistService's signal), so a failure can never leave
    // it lying about the real state.
    this.wishlistService.toggle(product.id).subscribe({
      error: (err: { error?: { message?: string } }) => {
        this.notificationService.error(err?.error?.message ?? 'Could not update your wishlist.');
      },
    });
  }

  /**
   * Wishlist toggle for the PDP hero / sticky bar (shared handler — only
   * one heart control exists for the page's own product, so there is no
   * risk of divergent state between call sites).
   */
  onWishlistToggle(): void {
    const product = this.product();
    if (!product) return;
    if (this.redirectAnonymous()) return;

    // Capture intent before the request resolves — WishlistService only
    // flips `has()` once the server confirms, so this can't drift from the
    // eventual heart state.
    const wasWishlisted = this.wishlistService.has(product.id);

    this.wishlistService.toggle(product.id).subscribe({
      next: () => {
        if (wasWishlisted) {
          this.notificationService.info(`Removed '${product.name}' from your wishlist.`);
          return;
        }
        this.notificationService
          .success(`Added '${product.name}' to your wishlist.`, 'View wishlist')
          .onAction()
          .subscribe(() => void this.router.navigate(['/wishlist']));
      },
      // No optimistic mutation here either — see onRelatedWishlistToggle.
      error: (err: { error?: { message?: string } }) => {
        this.notificationService.error(err?.error?.message ?? 'Could not update your wishlist.');
      },
    });
  }
}
