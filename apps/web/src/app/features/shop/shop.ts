import { isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CategoryDto, ProductDto, VendorDto } from '@hb/shared';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/api/cart.service';
import { CategoriesService } from '../../core/api/categories.service';
import { ProductsService } from '../../core/api/products.service';
import { VendorsService } from '../../core/api/vendors.service';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { ProductCard } from '../../shared/components/product-card/product-card';
import { CategoryChips } from '../../shared/components/category-chips/category-chips';
import { SearchBar } from '../../shared/components/search-bar/search-bar';
import { TrustBanner } from '../../shared/components/trust-banner/trust-banner';
import { VendorShowcase } from '../../shared/components/vendor-showcase/vendor-showcase';
import { RadialNav, RadialNavItemId } from '../../shared/components/radial-nav/radial-nav';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

/** Number of products shown in the "New in Namibia" carousel. */
const CAROUSEL_LIMIT = 8;

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

@Component({
  selector: 'app-shop',
  imports: [
    NavBar,
    Footer,
    RouterLink,
    MatSnackBarModule,
    ProductCard,
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
  private readonly snackBar = inject(MatSnackBar);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  /** Real cart count for the radial-nav badge. */
  readonly cartCount = this.cartService.itemCount;

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
    void this.router.navigate(['/discover'], { queryParams: { vendorId: vendor.id } });
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

  onHeroSmeVerification(): void {
    this.notifyComingSoon('SME Verification');
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
      next: () => this.notifyAddedToCart(product.name),
      error: (err: { error?: { message?: string } }) =>
        this.notifyCartError(err?.error?.message),
    });
  }

  onRadialNavSelect(itemId: RadialNavItemId): void {
    if (itemId === 'cart') {
      this.onCartClick();
      return;
    }
    const labels: Partial<Record<RadialNavItemId, string>> = {
      orders: 'My Orders',
      profile: 'Profile',
      wishlist: 'Wishlist',
    };
    this.notifyComingSoon(labels[itemId] ?? 'This feature');
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
    this.snackBar.open(`${feature} is coming soon.`, 'Close', {
      duration: 4000,
      horizontalPosition: 'end',
      panelClass: ['hb-info-snackbar'],
      verticalPosition: 'top',
    });
  }

  private notifyAddedToCart(productName: string): void {
    this.snackBar
      .open(`Added '${productName}' to your cart.`, 'View cart', {
        duration: 4000,
        horizontalPosition: 'end',
        panelClass: ['hb-info-snackbar'],
        verticalPosition: 'top',
      })
      .onAction()
      .subscribe(() => void this.router.navigate(['/cart']));
  }

  private notifyCartError(message?: string): void {
    this.snackBar.open(message ?? 'Could not add this item to your cart.', 'Close', {
      duration: 5000,
      horizontalPosition: 'end',
      panelClass: ['hb-error-snackbar'],
      verticalPosition: 'top',
    });
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
    this.productsService.list().subscribe({
      next: (list) => {
        this.products.set(list);
        this.productsState.set(list.length ? 'loaded' : 'empty');
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
