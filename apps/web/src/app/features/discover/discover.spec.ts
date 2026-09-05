import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AnalyticsEventType,
  AuthUser,
  CategoryDto,
  CountryCode,
  CurrencyCode,
  ListingType,
  ProductDto,
  SearchSuggestions,
  VendorDto,
  VendorStatus,
} from '@hb/shared';

import { Discover } from './discover';
import { ProductsService } from '../../core/api/products.service';
import { CategoriesService } from '../../core/api/categories.service';
import { VendorsService } from '../../core/api/vendors.service';
import { SearchService } from '../../core/api/search.service';
import { AuthService } from '../../core/auth/auth.service';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';
import { WishlistService } from '../../core/api/wishlist.service';
import { environment } from '../../../environments/environment';

// ─── Mock data ───────────────────────────────────────────────────────────────

const PLATFORM_LISTING: ProductDto = {
  id: 'p1',
  name: 'Organic Fynbos Honey',
  description: 'desc',
  price: 145,
  currency: CurrencyCode.ZAR,
  stockQuantity: 10,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.PLATFORM,
  images: [],
  categories: [],
  createdAt: '',
  updatedAt: '',
};

const VENDOR_LISTING: ProductDto = {
  id: 'p2',
  name: 'Handwoven Basket',
  description: 'desc',
  price: 320,
  currency: CurrencyCode.ZAR,
  stockQuantity: 5,
  originCountry: CountryCode.NAMIBIA,
  listingType: ListingType.VENDOR,
  images: [],
  vendor: { id: 'v1', businessName: 'Leko Organics' },
  categories: [],
  createdAt: '',
  updatedAt: '',
};

const MOCK_VENDOR: VendorDto = {
  id: 'v1',
  businessName: 'Leko Organics',
  status: VendorStatus.APPROVED,
  countryCode: CountryCode.SOUTH_AFRICA,
};

const MOCK_SUGGESTIONS: SearchSuggestions = {
  products: [{ id: 'sp1', name: 'Honey', price: 145, currency: CurrencyCode.ZAR, imageUrl: null, vendorName: null }],
  vendors: [{ id: 'sv1', businessName: 'Leko Organics', countryCode: CountryCode.SOUTH_AFRICA }],
  categories: [{ id: 'sc1', name: 'Agriculture', slug: 'agriculture' }],
};

// ─── Stub interfaces ──────────────────────────────────────────────────────────

interface ProductsStub {
  list: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
}

interface CategoriesStub {
  list: ReturnType<typeof vi.fn>;
}

interface VendorsStub {
  getById: ReturnType<typeof vi.fn>;
}

interface SearchStub {
  suggest: ReturnType<typeof vi.fn>;
}

interface AuthStub {
  isLoggedIn: ReturnType<typeof vi.fn>;
  currentUser$: BehaviorSubject<AuthUser | null>;
}

interface AnalyticsStub {
  track: ReturnType<typeof vi.fn>;
}

interface GaStub {
  addToCart: ReturnType<typeof vi.fn>;
}

interface WishlistStub {
  has: ReturnType<typeof vi.fn>;
  toggle: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  wishlist: ReturnType<typeof vi.fn>;
  itemCount: ReturnType<typeof vi.fn>;
}

function makeStubs(): {
  productsStub: ProductsStub;
  categoriesStub: CategoriesStub;
  vendorsStub: VendorsStub;
  searchStub: SearchStub;
  authStub: AuthStub;
  analyticsStub: AnalyticsStub;
  gaStub: GaStub;
  wishlistStub: WishlistStub;
} {
  return {
    productsStub: {
      list: vi.fn(() =>
        of({ items: [PLATFORM_LISTING, VENDOR_LISTING], total: 2, page: 1, limit: 24 }),
      ),
      getById: vi.fn(),
    },
    categoriesStub: {
      list: vi.fn(() => of([] as CategoryDto[])),
    },
    vendorsStub: {
      getById: vi.fn(() => of(MOCK_VENDOR)),
    },
    searchStub: {
      suggest: vi.fn(() => of(MOCK_SUGGESTIONS)),
    },
    authStub: {
      isLoggedIn: vi.fn(() => false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
    },
    analyticsStub: {
      track: vi.fn(),
    },
    gaStub: {
      addToCart: vi.fn(),
    },
    wishlistStub: {
      has: vi.fn(() => false),
      toggle: vi.fn(() => of({ items: [], itemCount: 0 })),
      load: vi.fn(() => of({ items: [], itemCount: 0 })),
      wishlist: vi.fn(() => null),
      itemCount: vi.fn(() => 0),
    },
  };
}

async function setupTestBed(
  productsStub: ProductsStub,
  categoriesStub: CategoriesStub,
  vendorsStub: VendorsStub,
  searchStub: SearchStub,
  authStub: AuthStub,
  analyticsStub: AnalyticsStub,
  gaStub: GaStub,
  wishlistStub: WishlistStub,
): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [Discover],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      provideRouter([]),
      { provide: ProductsService, useValue: productsStub },
      { provide: CategoriesService, useValue: categoriesStub },
      { provide: VendorsService, useValue: vendorsStub },
      { provide: SearchService, useValue: searchStub },
      { provide: AuthService, useValue: authStub },
      { provide: AnalyticsService, useValue: analyticsStub },
      { provide: GoogleAnalyticsService, useValue: gaStub },
      { provide: WishlistService, useValue: wishlistStub },
    ],
  }).compileComponents();
}

// ─── Main suite ───────────────────────────────────────────────────────────────

describe('Discover', () => {
  let fixture: ComponentFixture<Discover>;
  let component: Discover;
  let router: Router;
  let httpMock: HttpTestingController;
  let productsStub: ProductsStub;
  let categoriesStub: CategoriesStub;
  let vendorsStub: VendorsStub;
  let searchStub: SearchStub;
  let authStub: AuthStub;
  let analyticsStub: AnalyticsStub;
  let gaStub: GaStub;
  let wishlistStub: WishlistStub;

  beforeEach(async () => {
    ({ productsStub, categoriesStub, vendorsStub, searchStub, authStub, analyticsStub, gaStub, wishlistStub } =
      makeStubs());
    await setupTestBed(
      productsStub,
      categoriesStub,
      vendorsStub,
      searchStub,
      authStub,
      analyticsStub,
      gaStub,
      wishlistStub,
    );

    fixture = TestBed.createComponent(Discover);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('passes the storefront placeholder to the search bar', () => {
    // Scoped to the page's controls: the header now carries its own search input (Phase 2).
    const searchInput = fixture.nativeElement.querySelector('.discover__controls .search-bar__input') as HTMLInputElement;
    expect(searchInput.placeholder).toBe('Shop our latest products');
  });

  // Regression test for the CP1252/UTF-8 mis-decode that rendered
  // "productsâ€¦" / "Loading productsâ€¦" to users. `â€` is the signature byte
  // sequence of that corruption class — its absence from the rendered
  // template is what this guards.
  it('renders no mojibake from the historical UTF-8/CP1252 encoding bug', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain('â€');
  });

  it('fetches products on init with no filters, page 1 and the newest sort', () => {
    expect(productsStub.list).toHaveBeenCalledWith({
      q: undefined,
      categoryId: undefined,
      vendorId: undefined,
      page: 1,
      sort: 'newest',
    });
  });

  it('re-fetches when the q query param changes', async () => {
    await router.navigate([], { queryParams: { q: 'honey' } });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(productsStub.list).toHaveBeenCalledWith({
      q: 'honey',
      categoryId: undefined,
      vendorId: undefined,
      page: 1,
      sort: 'newest',
    });
  });

  it('re-fetches when the categoryId query param changes', async () => {
    await router.navigate([], { queryParams: { categoryId: 'cat-1' } });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(productsStub.list).toHaveBeenCalledWith({
      q: undefined,
      categoryId: 'cat-1',
      vendorId: undefined,
      page: 1,
      sort: 'newest',
    });
  });

  it('re-fetches when the vendorId query param changes', async () => {
    await router.navigate([], { queryParams: { vendorId: 'v1' } });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(productsStub.list).toHaveBeenCalledWith({
      q: undefined,
      categoryId: undefined,
      vendorId: 'v1',
      page: 1,
      sort: 'newest',
    });
  });

  it('re-fetches with the parsed page and sort when both query params change', async () => {
    await router.navigate([], { queryParams: { page: '2', sort: 'price_asc' } });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(productsStub.list).toHaveBeenCalledWith({
      q: undefined,
      categoryId: undefined,
      vendorId: undefined,
      page: 2,
      sort: 'price_asc',
    });
  });

  it('falls back to page 1 and sort "newest" for invalid query param values', async () => {
    await router.navigate([], { queryParams: { page: 'nope', sort: 'bogus' } });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.page()).toBe(1);
    expect(component.sort()).toBe('newest');
  });

  it('onCategorySelect navigates with the categoryId merged into query params and resets page', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.onCategorySelect('cat-9');
    expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { categoryId: 'cat-9', page: null },
      queryParamsHandling: 'merge',
    }));
  });

  it('shows the vendor filter chip once the vendorId param resolves a vendor name', async () => {
    await router.navigate([], { queryParams: { vendorId: 'v1' } });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Leko Organics');
  });

  it('dismissVendorFilter clears the vendorId param and resets page', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.dismissVendorFilter();
    expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { vendorId: null, page: null },
      queryParamsHandling: 'merge',
    }));
  });

  // ── Add to cart ────────────────────────────────────────────────────────

  it('authenticated add-to-cart fires ADD_TO_CART on success', () => {
    authStub.isLoggedIn.mockReturnValue(true);

    component.onAddToCart(VENDOR_LISTING);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart/items`);
    req.flush({ id: 'cart-1', items: [], totals: [], itemCount: 1, updatedAt: '' });

    expect(analyticsStub.track).toHaveBeenCalledWith(AnalyticsEventType.ADD_TO_CART, {
      productId: 'p2',
      vendorId: 'v1',
    });
    expect(gaStub.addToCart).toHaveBeenCalledWith(
      'p2',
      VENDOR_LISTING.name,
      VENDOR_LISTING.price,
      VENDOR_LISTING.currency,
    );
  });

  it('anonymous add-to-cart routes to /login and does not fire ADD_TO_CART', () => {
    authStub.isLoggedIn.mockReturnValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onAddToCart(VENDOR_LISTING);

    expect(navigateSpy).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: router.url },
    });
    expect(analyticsStub.track).not.toHaveBeenCalled();
  });

  // ── Wishlist toggle ────────────────────────────────────────────────────

  it('anonymous wishlist toggle routes to /login and never calls the wishlist API', () => {
    authStub.isLoggedIn.mockReturnValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onWishlistToggle(VENDOR_LISTING);

    expect(navigateSpy).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: router.url },
    });
    expect(wishlistStub.toggle).not.toHaveBeenCalled();
  });

  it('authenticated wishlist toggle calls WishlistService.toggle with the product id', () => {
    authStub.isLoggedIn.mockReturnValue(true);

    component.onWishlistToggle(VENDOR_LISTING);

    expect(wishlistStub.toggle).toHaveBeenCalledWith('p2');
  });

  it('the hydration gate starts closed: isWishlisted reads false immediately after construction, before any render', () => {
    // WishlistService already reports membership, but the SSR-rendered
    // markup and the client's pre-hydration DOM must still agree on an
    // empty heart. `hydrated` only flips inside the `afterNextRender`
    // callback registered in the constructor, which requires an actual
    // render pass — checking immediately after construction, before any
    // `detectChanges()`, is the one place it can't have fired yet. If the
    // gate were ever dropped (`isWishlisted` calling `has()` directly),
    // this would read `true` here and fail. (Not asserted post-hydration
    // here — this suite's product list resolves synchronously from a
    // stubbed observable, so the first `detectChanges()` both renders the
    // cards and flips `hydrated` in the same pass, which trips Angular's
    // dev-mode "changed after checked" guard; the shop.spec.ts suite covers
    // the full closed→open transition against a real, unflushed HTTP load.)
    wishlistStub.has.mockReturnValue(true);
    const freshComponent = TestBed.createComponent(Discover).componentInstance;

    expect(freshComponent.isWishlisted('p2')).toBe(false);
  });

  it('renders the full server result set, including a platform-fulfilled listing with no vendor, with no filters applied', () => {
    expect(component.products().length).toBe(2);
    expect(component.products().some((p) => p.id === PLATFORM_LISTING.id && !p.vendor)).toBe(true);

    const el: HTMLElement = fixture.nativeElement;
    const cards = el.querySelectorAll('app-product-card');
    expect(cards.length).toBe(2);
  });

  it('shows an empty state with a clear-all action when no products match', async () => {
    productsStub.list.mockReturnValue(of({ items: [], total: 0, page: 1, limit: 24 }));
    await router.navigate([], { queryParams: { q: 'nonexistent' } });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No products match your search/filters');
    expect(el.querySelector('.discover__clear-btn')).toBeTruthy();
  });

  describe('suggestion mapping + selection', () => {
    it('does not call suggest for terms under 2 characters', () => {
      component.onSearchTermChange('h');
      expect(searchStub.suggest).not.toHaveBeenCalled();
      expect(component.suggestionGroups()).toBeNull();
    });

    it('maps SearchSuggestions into grouped SuggestionGroup[] for products/vendors/categories', () => {
      component.onSearchTermChange('honey');
      const groups = component.suggestionGroups();
      expect(groups).toEqual([
        {
          label: 'Products',
          items: [{ id: 'sp1', label: 'Honey', sublabel: expect.stringContaining('145'), imageUrl: undefined }],
        },
        { label: 'Vendors', items: [{ id: 'sv1', label: 'Leko Organics', sublabel: 'ZA', icon: 'storefront' }] },
        { label: 'Categories', items: [{ id: 'sc1', label: 'Agriculture', icon: 'category' }] },
      ]);
    });

    it('routes to /products/:id on a Products suggestion selection', () => {
      const navigateSpy = vi.spyOn(router, 'navigate');
      component.onSuggestionSelected({ group: 'Products', item: { id: 'sp1', label: 'Honey' } });
      expect(navigateSpy).toHaveBeenCalledWith(['/products', 'sp1']);
    });

    it('navigates to /vendors/:id on a Vendors suggestion selection', () => {
      const navigateSpy = vi.spyOn(router, 'navigate');
      component.onSuggestionSelected({ group: 'Vendors', item: { id: 'sv1', label: 'Leko Organics' } });
      expect(navigateSpy).toHaveBeenCalledWith(['/vendors', 'sv1']);
    });

    it('sets categoryId, clears q and resets page on a Categories suggestion selection', () => {
      const navigateSpy = vi.spyOn(router, 'navigate');
      component.onSuggestionSelected({ group: 'Categories', item: { id: 'sc1', label: 'Agriculture' } });
      expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { categoryId: 'sc1', q: null, page: null },
        queryParamsHandling: 'merge',
      }));
    });

    it('handles a failed suggest() call by clearing suggestions and loading state', () => {
      searchStub.suggest.mockReturnValue(throwError(() => new Error('network')));
      component.onSearchTermChange('honey');
      expect(component.suggestionGroups()).toBeNull();
      expect(component.suggestLoading()).toBe(false);
    });
  });

  it('onSearchSubmit sets the q param and resets page', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.onSearchSubmit('honey');
    expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { q: 'honey', page: null },
      queryParamsHandling: 'merge',
    }));
  });

  it('onSearchCleared drops the q param and resets page', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.onSearchCleared();
    expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { q: null, page: null },
      queryParamsHandling: 'merge',
    }));
  });

  // ── Sort ─────────────────────────────────────────────────────────────────

  it('onSortChange navigates with the new sort and resets page to 1', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.onSortChange('price_asc');
    expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { sort: 'price_asc', page: null },
      queryParamsHandling: 'merge',
    }));
  });

  it('the sort select reflects the current sort() and changing it navigates', () => {
    const el: HTMLElement = fixture.nativeElement;
    const select = el.querySelector('#discover-sort') as HTMLSelectElement;
    expect(select.value).toBe('newest');

    const navigateSpy = vi.spyOn(router, 'navigate');
    select.value = 'name';
    select.dispatchEvent(new Event('change'));

    expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { sort: 'name', page: null },
      queryParamsHandling: 'merge',
    }));
  });

  // ── Pager ────────────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('computes totalPages from total and the returned limit', async () => {
      productsStub.list.mockReturnValue(
        of({ items: [PLATFORM_LISTING, VENDOR_LISTING], total: 50, page: 2, limit: 24 }),
      );
      // Navigate to a page other than the default (1) so the `page` computed
      // signal's value actually changes and the fetch effect re-runs.
      await router.navigate([], { queryParams: { page: '2' } });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.totalPages()).toBe(3);
    });

    it('Prev is disabled on page 1', () => {
      const el: HTMLElement = fixture.nativeElement;
      const prevBtn = el.querySelector('.discover__pager-btn--prev') as HTMLButtonElement;
      expect(prevBtn.disabled).toBe(true);
    });

    it('Next is disabled on the last page', async () => {
      productsStub.list.mockReturnValue(
        of({ items: [PLATFORM_LISTING], total: 2, page: 1, limit: 24 }),
      );
      await router.navigate([], { queryParams: { sort: 'name' } });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const nextBtn = el.querySelector('.discover__pager-btn--next') as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(true);
    });

    it('Next is enabled and navigates to the next page when more pages remain', async () => {
      productsStub.list.mockReturnValue(
        of({ items: [PLATFORM_LISTING, VENDOR_LISTING], total: 50, page: 1, limit: 24 }),
      );
      // Force a re-fetch via the sort param (page stays at its default of 1 —
      // a `page` navigation to '1' wouldn't change the computed signal's
      // value and so wouldn't re-trigger the fetch effect).
      await router.navigate([], { queryParams: { sort: 'name' } });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const navigateSpy = vi.spyOn(router, 'navigate');
      const el: HTMLElement = fixture.nativeElement;
      const nextBtn = el.querySelector('.discover__pager-btn--next') as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(false);

      nextBtn.click();
      expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { page: 2 },
        queryParamsHandling: 'merge',
      }));
    });

    it('Prev navigates to the previous page when not on page 1', async () => {
      productsStub.list.mockReturnValue(
        of({ items: [PLATFORM_LISTING, VENDOR_LISTING], total: 50, page: 2, limit: 24 }),
      );
      await router.navigate([], { queryParams: { page: '2' } });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const navigateSpy = vi.spyOn(router, 'navigate');
      const el: HTMLElement = fixture.nativeElement;
      const prevBtn = el.querySelector('.discover__pager-btn--prev') as HTMLButtonElement;
      expect(prevBtn.disabled).toBe(false);

      prevBtn.click();
      expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { page: 1 },
        queryParamsHandling: 'merge',
      }));
    });

    it('shows a "Page X of Y" indicator', async () => {
      productsStub.list.mockReturnValue(
        of({ items: [PLATFORM_LISTING, VENDOR_LISTING], total: 50, page: 2, limit: 24 }),
      );
      await router.navigate([], { queryParams: { page: '2' } });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.discover__pager-status')?.textContent).toContain('Page 2 of 3');
    });

    it('self-heals an out-of-range ?page= by redirecting to the last valid page', async () => {
      // total 50 / limit 24 → last page is 3; requesting page 99 must redirect.
      productsStub.list.mockReturnValue(
        of({ items: [], total: 50, page: 99, limit: 24 }),
      );
      const navigateSpy = vi.spyOn(router, 'navigate');
      await router.navigate([], { queryParams: { page: '99' } });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { page: 3 },
        queryParamsHandling: 'merge',
      }));
    });
  });
});
