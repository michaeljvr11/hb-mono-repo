import { Component, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import {
  AnalyticsEventType,
  CategoryDto,
  ProductDto,
  ProductQuery,
  ProductSort,
  SearchSuggestions,
  VendorDto,
} from '@hb/shared';
import { AuthService } from '../../core/auth/auth.service';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';
import { ProductsService } from '../../core/api/products.service';
import { CartService } from '../../core/api/cart.service';
import { WishlistService } from '../../core/api/wishlist.service';
import { CategoriesService } from '../../core/api/categories.service';
import { VendorsService } from '../../core/api/vendors.service';
import { SearchService } from '../../core/api/search.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { formatPrice } from '../../shared/format-price';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { ProductCard } from '../../shared/components/product-card/product-card';
import { CategoryChips } from '../../shared/components/category-chips/category-chips';
import { SearchBar, SuggestionGroup, SuggestionSelectedEvent } from '../../shared/components/search-bar/search-bar';
import { RadialNav } from '../../shared/components/radial-nav/radial-nav';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

const ALLOWED_SORTS: ProductSort[] = ['newest', 'price_asc', 'price_desc', 'name'];

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name', label: 'Name: A–Z' },
];

/**
 * Product discovery / browse page. All filter/sort/page state lives in the
 * URL query params (q / categoryId / vendorId / sort / page) so the page is
 * SSR-safe and shareable — user interactions navigate (merging query params
 * via `Router.navigate`), and a single reactive source (the `paramMap`
 * signal from `toSignal`) drives the q/categoryId/vendorId/sort/page signals
 * plus an `effect` that re-fetches the product list + vendor-chip name on
 * every change. Pages replace rather than accumulate — `?page=2` always
 * SSR-renders exactly that slice. Changing a filter or the sort resets
 * `page` back to 1 so users never land on an out-of-range page.
 */
@Component({
  selector: 'app-discover',
  imports: [NavBar, Footer, ProductCard, CategoryChips, SearchBar, RadialNav],
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
  private readonly wishlistService = inject(WishlistService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly gaService = inject(GoogleAnalyticsService);
  private readonly notificationService = inject(NotificationService);

  /** Real cart count for the radial-nav badge. */
  readonly cartCount = this.cartService.itemCount;

  // Hydration gate: server render and first client render must both show
  // empty hearts (no anonymous-vs-signed-in DOM mismatch) — see nav-bar.ts.
  private readonly hydrated = signal(false);

  /** True once hydrated and the product is on the signed-in user's wishlist. */
  readonly isWishlisted = (productId: string): boolean =>
    this.hydrated() && this.wishlistService.has(productId);

  /** Real wishlist count for the radial-nav badge — 0 until hydrated, same gate as isWishlisted. */
  readonly wishlistCount = computed(() =>
    this.hydrated() ? this.wishlistService.itemCount() : 0,
  );

  // ── URL-driven params (single source of truth) ─────────────────────────
  private readonly paramMap = toSignal<ParamMap | null>(this.route.queryParamMap, {
    initialValue: null,
  });

  readonly q = computed(() => this.paramMap()?.get('q') ?? '');
  readonly categoryId = computed(() => this.paramMap()?.get('categoryId') ?? null);
  readonly vendorId = computed(() => this.paramMap()?.get('vendorId') ?? null);

  /** 1-based page number from `?page=`; falls back to 1 for missing/invalid values. */
  readonly page = computed(() => {
    const raw = this.paramMap()?.get('page');
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  });

  /** Sort order from `?sort=`; falls back to 'newest' for missing/invalid values. */
  readonly sort = computed<ProductSort>(() => {
    const raw = this.paramMap()?.get('sort');
    return (ALLOWED_SORTS as string[]).includes(raw ?? '') ? (raw as ProductSort) : 'newest';
  });

  readonly sortOptions = SORT_OPTIONS;

  // ── Products (server fetch reacts to any param change) ─────────────────
  readonly products = signal<ProductDto[]>([]);
  readonly productsState = signal<LoadState>('loading');
  readonly total = signal(0);
  readonly pageSize = signal(24);

  readonly currentPage = computed(() => this.page());
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  // ── Categories (for the chip row) ───────────────────────────────────────
  readonly categories = signal<CategoryDto[]>([]);

  // ── Vendor filter chip (resolved name for the active vendorId) ─────────
  readonly activeVendor = signal<VendorDto | null>(null);

  readonly resultCount = computed(() => this.products().length);

  readonly hasActiveFilters = computed(
    () => !!this.q() || !!this.categoryId() || !!this.vendorId(),
  );

  // ── Omnibox suggestions ──────────────────────────────────────────────────
  readonly suggestionGroups = signal<SuggestionGroup[] | null>(null);
  readonly suggestLoading = signal(false);

  constructor() {
    afterNextRender(() => {
      this.hydrated.set(true);
      // Prime the wishlist once per page load for signed-in users; toggles
      // elsewhere keep the shared WishlistService signal fresh.
      if (this.authService.isLoggedIn() && this.wishlistService.wishlist() === null) {
        this.wishlistService.load().subscribe({ error: () => undefined });
      }
    });

    this.categoriesService.list().subscribe({
      next: (list) => this.categories.set(list),
      error: () => this.categories.set([]),
    });

    // Single reactive source: the `paramMap` signal (backed by `queryParamMap`
    // via `toSignal`) drives the q/categoryId/vendorId/sort/page signals above
    // and this fetch effect — re-runs on every URL query param change. Pages
    // replace rather than accumulate (no `limit` sent — the server default and
    // its returned `limit` drive pager math via `pageSize`).
    effect(() => {
      const query: ProductQuery = {
        q: this.q() || undefined,
        categoryId: this.categoryId() ?? undefined,
        vendorId: this.vendorId() ?? undefined,
        page: this.page(),
        sort: this.sort(),
      };

      this.fetchProducts(query);
      this.fetchVendorName(query.vendorId ?? null);
    });
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  private fetchProducts(query: ProductQuery): void {
    this.productsState.set('loading');
    this.productsService.list(query).subscribe({
      next: (res) => {
        // Self-heal an out-of-range ?page= (e.g. a shared/stale deep link past
        // the last page): redirect to the last valid page rather than stranding
        // the user on an empty grid with no pager to navigate back.
        const lastPage = Math.max(1, Math.ceil(res.total / res.limit));
        if (res.total > 0 && this.page() > lastPage) {
          this.navigateMerge({ page: lastPage === 1 ? null : lastPage });
          return;
        }
        this.products.set(res.items);
        this.total.set(res.total);
        this.pageSize.set(res.limit);
        this.productsState.set(res.items.length ? 'loaded' : 'empty');
      },
      error: () => {
        this.products.set([]);
        this.total.set(0);
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
    this.navigateMerge({ categoryId, page: null });
  }

  dismissVendorFilter(): void {
    this.navigateMerge({ vendorId: null, page: null });
  }

  onSortChange(sort: ProductSort): void {
    this.navigateMerge({ sort, page: null });
  }

  onPrevPage(): void {
    if (this.currentPage() <= 1) return;
    this.navigateMerge({ page: this.currentPage() - 1 });
  }

  onNextPage(): void {
    if (this.currentPage() >= this.totalPages()) return;
    this.navigateMerge({ page: this.currentPage() + 1 });
  }

  clearAllFilters(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
    });
  }

  onSearchSubmit(term: string): void {
    const q = term.trim();
    this.navigateMerge({ q: q || null, page: null });
  }

  onSearchCleared(): void {
    this.navigateMerge({ q: null, page: null });
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
        void this.router.navigate(['/vendors', event.item.id]);
        break;
      case 'Categories':
        this.navigateMerge({ categoryId: event.item.id, q: null, page: null });
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
      error: (err: { error?: { message?: string } }) => {
        this.notificationService.error(err?.error?.message ?? 'Could not update your wishlist.');
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

  private navigateMerge(patch: Record<string, string | number | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
    });
  }
}
