import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  OnInit,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AnalyticsEventType, CategoryDto, ProductDto, VendorDto } from '@hb/shared';
import { AuthService } from '../../core/auth/auth.service';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';
import { CartService } from '../../core/api/cart.service';
import { WishlistService } from '../../core/api/wishlist.service';
import { CategoriesService } from '../../core/api/categories.service';
import { ProductsService } from '../../core/api/products.service';
import { VendorsService } from '../../core/api/vendors.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { ProductCard } from '../../shared/components/product-card/product-card';
import { ProductCardSkeleton } from '../../shared/components/product-card/product-card-skeleton';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { CategoryChips } from '../../shared/components/category-chips/category-chips';
import { SearchBar } from '../../shared/components/search-bar/search-bar';
import { TrustBanner } from '../../shared/components/trust-banner/trust-banner';
import { VendorShowcase } from '../../shared/components/vendor-showcase/vendor-showcase';
import { RadialNav, RadialNavItemId } from '../../shared/components/radial-nav/radial-nav';
import { SITE_IMAGES } from '../../shared/constants/image.constants';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

/** Number of products shown in the "New in Namibia" carousel. */
const CAROUSEL_LIMIT = 8;

/**
 * Rendered width of the hero photograph (`shop.scss`): the full viewport below 1280px,
 * then the 5/12 column of the `wide` container (capped at 1440 − gutters ≈ 560px).
 */
const HERO_IMAGE_SIZES = '(min-width: 1440px) 560px, (min-width: 1280px) 40vw, 100vw';

/** Server-side max page size — used to avoid truncating the storefront's product list. */
const PRODUCT_LIST_MAX = 100;

export interface CategoryWithCount extends CategoryDto {
  productCount: number;
}

/**
 * Pure derivation of per-category product counts from the loaded product list.
 * Extracted so it can be unit-tested directly (a product may span several
 * categories, so each of its category ids is counted).
 */
export function deriveCategoryCounts(
  categories: CategoryWithCount[],
  products: ProductDto[],
): CategoryWithCount[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    for (const cat of product.categories ?? []) {
      counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
    }
  }
  return categories.map((c) => ({ ...c, productCount: counts.get(c.id) ?? 0 }));
}

/**
 * Listing count per vendor id from the loaded product list — the "N listings" line on
 * the vendor showcase (Phase 3). Platform listings have no vendor and are skipped.
 * Pure, so it is unit-tested directly like `deriveCategoryCounts`.
 */
export function deriveVendorListingCounts(products: ProductDto[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const product of products) {
    const vendorId = product.vendor?.id;
    if (!vendorId) continue;
    counts[vendorId] = (counts[vendorId] ?? 0) + 1;
  }
  return counts;
}

@Component({
  selector: 'app-shop',
  imports: [
    NavBar,
    Footer,
    RouterLink,
    ProductCard,
    ProductCardSkeleton,
    Skeleton,
    CategoryChips,
    SearchBar,
    TrustBanner,
    VendorShowcase,
    RadialNav,
  ],
  templateUrl: './shop.html',
  styleUrl: './shop.scss',
})
export class Shop implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly vendorsService = inject(VendorsService);
  private readonly notificationService = inject(NotificationService);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly wishlistService = inject(WishlistService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly gaService = inject(GoogleAnalyticsService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  /** Real cart count for the radial-nav badge. */
  readonly cartCount = this.cartService.itemCount;

  // Hydration gate: server render and first client render must both show
  // empty hearts (no anonymous-vs-signed-in DOM mismatch) — see nav-bar.ts.
  private readonly hydrated = signal(false);

  /** Real wishlist count for the radial-nav badge — 0 until hydrated, same gate as isWishlisted. */
  readonly wishlistCount = computed(() =>
    this.hydrated() ? this.wishlistService.itemCount() : 0,
  );

  /** True once hydrated and the product is on the signed-in user's wishlist. */
  readonly isWishlisted = (productId: string): boolean =>
    this.hydrated() && this.wishlistService.has(productId);

  // Products
  readonly products = signal<ProductDto[]>([]);
  readonly productsState = signal<LoadState>('loading');

  // Categories with derived product counts
  readonly categories = signal<CategoryWithCount[]>([]);
  readonly categoriesState = signal<LoadState>('loading');

  // Vendors
  readonly vendors = signal<VendorDto[]>([]);
  readonly vendorsState = signal<LoadState>('loading');

  /** First page of "New in Namibia" carousel products. */
  readonly carouselProducts = computed(() => this.products().slice(0, CAROUSEL_LIMIT));

  /** "N listings" per vendor on the showcase, from the products already loaded. */
  readonly vendorListingCounts = computed(() => deriveVendorListingCounts(this.products()));

  // Hero photograph: WebP-first `<picture>`, eager + high priority (it is the LCP element).
  readonly heroImage = SITE_IMAGES.hero;
  readonly heroSizes = HERO_IMAGE_SIZES;

  // Skeleton counts while each section loads — sized to a typical first row.
  readonly carouselSkeletons = [0, 1, 2, 3, 4, 5];
  readonly categorySkeletons = [0, 1, 2, 3];
  readonly vendorSkeletons = [0, 1, 2];

  constructor() {
    afterNextRender(() => {
      this.hydrated.set(true);
      // Prime the wishlist once per page load for signed-in users; toggles
      // elsewhere keep the shared WishlistService signal fresh.
      if (this.authService.isLoggedIn() && this.wishlistService.wishlist() === null) {
        this.wishlistService.load().subscribe({ error: () => undefined });
      }
    });
  }

  ngOnInit(): void {
    this.loadProducts();
    this.loadCategories();
    this.loadVendors();
  }

  // ── Navigation handlers ────────────────────────────────────────────────────

  onCategorySelect(categoryId: string | null): void {
    if (!categoryId) return;
    void this.router.navigate(['/discover'], { queryParams: { categoryId } });
  }

  onVendorSelect(vendor: VendorDto): void {
    void this.router.navigate(['/vendors', vendor.id]);
  }

  onMobileSearch(term: string): void {
    const q = term.trim();
    if (!q) return;
    void this.router.navigate(['/discover'], { queryParams: { q } });
  }

  onHeroShopNow(): void {
    if (isPlatformBrowser(this.platformId)) {
      const carousel = document.getElementById('new-in-namibia');
      if (carousel) {
        carousel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    void this.router.navigate(['/discover']);
  }

  onNewsletterJoin(): void {
    this.notifyComingSoon('Newsletter');
  }

  onAddToCart(product: ProductDto): void {
    if (!this.authService.isLoggedIn()) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    this.cartService.addItem(product.id).subscribe({
      next: () => {
        this.analyticsService.track(AnalyticsEventType.ADD_TO_CART, {
          productId: product.id,
          vendorId: product.vendor?.id,
        });
        this.gaService.addToCart(product.id, product.name, product.price, product.currency);
        this.notifyAddedToCart(product.name);
      },
      error: (err: { error?: { message?: string } }) =>
        this.notifyCartError(err?.error?.message),
    });
  }

  onWishlistToggle(product: ProductDto): void {
    if (!this.authService.isLoggedIn()) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    // No optimistic mutation — the heart only reflects a successful server
    // response (via WishlistService's signal), so a failure can never leave
    // it lying about the real state.
    this.wishlistService.toggle(product.id).subscribe({
      error: (err: { error?: { message?: string } }) =>
        this.notifyWishlistError(err?.error?.message),
    });
  }

  onRadialNavSelect(itemId: RadialNavItemId): void {
    // Cart is the only item without a routerLink: it needs the anonymous
    // redirect to carry a returnUrl, which a guard cannot do.
    if (itemId === 'cart') {
      this.onCartClick();
      return;
    }
    this.notifyComingSoon('This feature');
  }

  private onCartClick(): void {
    if (this.authService.isLoggedIn()) {
      void this.router.navigate(['/cart']);
      return;
    }
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }

  private notifyComingSoon(feature: string): void {
    this.notificationService.info(`${feature} is coming soon.`);
  }

  private notifyAddedToCart(productName: string): void {
    this.notificationService
      .success(`Added '${productName}' to your cart.`, 'View cart')
      .onAction()
      .subscribe(() => void this.router.navigate(['/cart']));
  }

  private notifyCartError(message?: string): void {
    this.notificationService.error(message ?? 'Could not add this item to your cart.');
  }

  private notifyWishlistError(message?: string): void {
    this.notificationService.error(message ?? 'Could not update your wishlist.');
  }

  // ── Category helpers ──────────────────────────────────────────────────────

  getCategoryIcon(categoryName: string): string {
    const name = categoryName.toLowerCase();
    if (name.includes('agriculture') || name.includes('farm') || name.includes('food')) return 'agriculture';
    if (name.includes('health') || name.includes('beauty') || name.includes('wellness')) return 'spa';
    if (name.includes('textile') || name.includes('fabric') || name.includes('cloth')) return 'checkroom';
    if (name.includes('craft') || name.includes('handmade') || name.includes('art')) return 'palette';
    if (name.includes('electronic') || name.includes('tech')) return 'devices';
    if (name.includes('home') || name.includes('furniture')) return 'chair';
    if (name.includes('sport') || name.includes('outdoor')) return 'sports';
    return 'category';
  }

  // ── Private data loaders ──────────────────────────────────────────────────

  private loadProducts(): void {
    this.productsState.set('loading');
    this.productsService.list({ limit: PRODUCT_LIST_MAX }).subscribe({
      next: (res) => {
        this.products.set(res.items);
        this.productsState.set(res.items.length ? 'loaded' : 'empty');
        // Rebuild category counts once products are known
        this.rebuildCategoryCounts();
      },
      error: () => {
        this.productsState.set('error');
      },
    });
  }

  private loadCategories(): void {
    this.categoriesState.set('loading');
    this.categoriesService.list().subscribe({
      next: (list) => {
        // We set raw data here; counts are merged after products load
        this.categories.set(list.map(c => ({ ...c, productCount: 0 })));
        this.categoriesState.set(list.length ? 'loaded' : 'empty');
        this.rebuildCategoryCounts();
      },
      error: () => {
        this.categoriesState.set('error');
      },
    });
  }

  private loadVendors(): void {
    this.vendorsState.set('loading');
    this.vendorsService.directory().subscribe({
      next: (list) => {
        this.vendors.set(list);
        this.vendorsState.set(list.length ? 'loaded' : 'empty');
      },
      error: () => {
        this.vendorsState.set('error');
      },
    });
  }

  /**
   * Derives product counts per category from the in-memory product list.
   * Called after either products or categories resolve so whichever arrives
   * last triggers the final accurate count.
   */
  private rebuildCategoryCounts(): void {
    const cats = this.categories();
    if (!cats.length) return;
    this.categories.set(deriveCategoryCounts(cats, this.products()));
  }
}
