import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AnalyticsEventType, CategoryDto, ProductDto, SearchSuggestions, VendorDto } from '@hb/shared';
import { AuthService } from '../../core/auth/auth.service';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';
import { ProductsService } from '../../core/api/products.service';
import { CartService } from '../../core/api/cart.service';
import { CategoriesService } from '../../core/api/categories.service';
import { VendorsService } from '../../core/api/vendors.service';
import { SearchService } from '../../core/api/search.service';
import { formatPrice } from '../../shared/format-price';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { ProductCard } from '../../shared/components/product-card/product-card';
import { CategoryChips } from '../../shared/components/category-chips/category-chips';
import { SearchBar, SuggestionGroup, SuggestionSelectedEvent } from '../../shared/components/search-bar/search-bar';
import { RadialNav } from '../../shared/components/radial-nav/radial-nav';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

/**
 * Product discovery / browse page. All filter state lives in the URL query
 * params (q / categoryId / vendorId) so the page is SSR-safe and shareable —
 * user interactions navigate (merging query params via `Router.navigate`),
 * and a single reactive source (the `paramMap` signal from `toSignal`) drives
 * the q/categoryId/vendorId signals plus an `effect` that re-fetches the
 * product list + vendor-chip name on every change.
 */
@Component({
  selector: 'app-discover',
  imports: [NavBar, Footer, MatSnackBarModule, ProductCard, CategoryChips, SearchBar, RadialNav],
  templateUrl: './discover.html',
  styleUrl: './discover.scss',
})
export class Discover {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly vendorsService = inject(VendorsService);
  private readonly searchService = inject(SearchService);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly gaService = inject(GoogleAnalyticsService);
  private readonly snackBar = inject(MatSnackBar);

  /** Real cart count for the radial-nav badge. */
  readonly cartCount = this.cartService.itemCount;

  // ── URL-driven params (single source of truth) ─────────────────────────
  private readonly paramMap = toSignal<ParamMap | null>(this.route.queryParamMap, {
    initialValue: null,
  });

  readonly q = computed(() => this.paramMap()?.get('q') ?? '');
  readonly categoryId = computed(() => this.paramMap()?.get('categoryId') ?? null);
  readonly vendorId = computed(() => this.paramMap()?.get('vendorId') ?? null);

  // ── Products (server fetch reacts to any param change) ─────────────────
  readonly products = signal<ProductDto[]>([]);
  readonly productsState = signal<LoadState>('loading');

  // ── Categories (for the chip row) ───────────────────────────────────────
  readonly categories = signal<CategoryDto[]>([]);

  // ── Vendor filter chip (resolved name for the active vendorId) ─────────
  readonly activeVendor = signal<VendorDto | null>(null);

  // ── SME toggle (client-side composition on top of server results) ──────
  readonly smeOnly = signal(true);

  readonly filteredProducts = computed(() => {
    const products = this.products();
    return this.smeOnly() ? products.filter((p) => !!p.vendor) : products;
  });

  readonly resultCount = computed(() => this.filteredProducts().length);

  readonly hasActiveFilters = computed(
    () => !!this.q() || !!this.categoryId() || !!this.vendorId(),
  );

  // ── Omnibox suggestions ──────────────────────────────────────────────────
  readonly suggestionGroups = signal<SuggestionGroup[] | null>(null);
  readonly suggestLoading = signal(false);

  constructor() {
    this.categoriesService.list().subscribe({
      next: (list) => this.categories.set(list),
      error: () => this.categories.set([]),
    });

    // Single reactive source: the `paramMap` signal (backed by `queryParamMap`
    // via `toSignal`) drives both the q/categoryId/vendorId signals above and
    // this fetch effect — re-runs on every URL query param change.
    effect(() => {
      const query = {
        q: this.q() || undefined,
        categoryId: this.categoryId() ?? undefined,
        vendorId: this.vendorId() ?? undefined,
      };

      this.fetchProducts(query);
      this.fetchVendorName(query.vendorId ?? null);
    });
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  private fetchProducts(query: { q?: string; categoryId?: string; vendorId?: string }): void {
    this.productsState.set('loading');
    this.productsService.list(query).subscribe({
      next: (list) => {
        this.products.set(list);
        this.productsState.set(list.length ? 'loaded' : 'empty');
      },
      error: () => {
        this.products.set([]);
        this.productsState.set('error');
      },
    });
  }

  private fetchVendorName(vendorId: string | null): void {
    if (!vendorId) {
      this.activeVendor.set(null);
      return;
    }
    this.vendorsService.getById(vendorId).subscribe({
      next: (vendor) => this.activeVendor.set(vendor),
      error: () => this.activeVendor.set(null),
    });
  }

  // ── User actions → URL navigation ─────────────────────────────────────────

  onCategorySelect(categoryId: string | null): void {
    this.navigateMerge({ categoryId });
  }

  onSmeToggle(checked: boolean): void {
    this.smeOnly.set(checked);
  }

  dismissVendorFilter(): void {
    this.navigateMerge({ vendorId: null });
  }

  clearAllFilters(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
    });
  }

  onSearchSubmit(term: string): void {
    const q = term.trim();
    this.navigateMerge({ q: q || null });
  }

  onSearchCleared(): void {
    this.navigateMerge({ q: null });
  }

  onSearchTermChange(term: string): void {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      this.suggestionGroups.set(null);
      this.suggestLoading.set(false);
      return;
    }
    this.suggestLoading.set(true);
    this.searchService.suggest(trimmed).subscribe({
      next: (suggestions) => {
        this.suggestionGroups.set(this.mapSuggestions(suggestions));
        this.suggestLoading.set(false);
      },
      error: () => {
        this.suggestionGroups.set(null);
        this.suggestLoading.set(false);
      },
    });
  }

  onSuggestionSelected(event: SuggestionSelectedEvent): void {
    switch (event.group) {
      case 'Products':
        void this.router.navigate(['/products', event.item.id]);
        break;
      case 'Vendors':
        this.navigateMerge({ vendorId: event.item.id, q: null });
        break;
      case 'Categories':
        this.navigateMerge({ categoryId: event.item.id, q: null });
        break;
    }
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
        this.snackBar
          .open(`Added '${product.name}' to your cart.`, 'View cart', {
            duration: 4000,
            horizontalPosition: 'end',
            panelClass: ['hb-info-snackbar'],
            verticalPosition: 'top',
          })
          .onAction()
          .subscribe(() => void this.router.navigate(['/cart']));
      },
      error: (err: { error?: { message?: string } }) => {
        this.snackBar.open(
          err?.error?.message ?? 'Could not add this item to your cart.',
          'Close',
          {
            duration: 5000,
            horizontalPosition: 'end',
            panelClass: ['hb-error-snackbar'],
            verticalPosition: 'top',
          },
        );
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private mapSuggestions(suggestions: SearchSuggestions): SuggestionGroup[] {
    const groups: SuggestionGroup[] = [];

    if (suggestions.products.length) {
      groups.push({
        label: 'Products',
        items: suggestions.products.map((p) => ({
          id: p.id,
          label: p.name,
          sublabel: formatPrice(p.price, p.currency),
          imageUrl: p.imageUrl ?? undefined,
        })),
      });
    }

    if (suggestions.vendors.length) {
      groups.push({
        label: 'Vendors',
        items: suggestions.vendors.map((v) => ({
          id: v.id,
          label: v.businessName,
          sublabel: v.countryCode ?? undefined,
          icon: 'storefront',
        })),
      });
    }

    if (suggestions.categories.length) {
      groups.push({
        label: 'Categories',
        items: suggestions.categories.map((c) => ({
          id: c.id,
          label: c.name,
          icon: 'category',
        })),
      });
    }

    return groups;
  }

  private navigateMerge(patch: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
    });
  }
}
