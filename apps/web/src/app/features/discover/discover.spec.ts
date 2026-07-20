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

function makeStubs(): {
  productsStub: ProductsStub;
  categoriesStub: CategoriesStub;
  vendorsStub: VendorsStub;
  searchStub: SearchStub;
  authStub: AuthStub;
  analyticsStub: AnalyticsStub;
  gaStub: GaStub;
} {
  return {
    productsStub: {
      list: vi.fn(() => of([PLATFORM_LISTING, VENDOR_LISTING])),
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

  beforeEach(async () => {
    ({ productsStub, categoriesStub, vendorsStub, searchStub, authStub, analyticsStub, gaStub } =
      makeStubs());
    await setupTestBed(
      productsStub,
      categoriesStub,
      vendorsStub,
      searchStub,
      authStub,
      analyticsStub,
      gaStub,
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

  it('fetches products on init with no filters', () => {
    expect(productsStub.list).toHaveBeenCalledWith({
      q: undefined,
      categoryId: undefined,
      vendorId: undefined,
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
    });
  });

  it('onCategorySelect navigates with the categoryId merged into query params', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.onCategorySelect('cat-9');
    expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { categoryId: 'cat-9' },
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

  it('dismissVendorFilter clears the vendorId param', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.dismissVendorFilter();
    expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { vendorId: null },
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

  it('SME toggle filters out products without a vendor (platform listings)', () => {
    expect(component.smeOnly()).toBe(true);
    expect(component.filteredProducts().length).toBe(1);
    expect(component.filteredProducts()[0].id).toBe('p2');

    component.onSmeToggle(false);
    fixture.detectChanges();
    expect(component.filteredProducts().length).toBe(2);
  });

  it('shows an empty state with a clear-all action when no products match', async () => {
    productsStub.list.mockReturnValue(of([]));
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

    it('sets categoryId and clears q on a Categories suggestion selection', () => {
      const navigateSpy = vi.spyOn(router, 'navigate');
      component.onSuggestionSelected({ group: 'Categories', item: { id: 'sc1', label: 'Agriculture' } });
      expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
        queryParams: { categoryId: 'sc1', q: null },
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

  it('onSearchSubmit sets the q param', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.onSearchSubmit('honey');
    expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { q: 'honey' },
      queryParamsHandling: 'merge',
    }));
  });

  it('onSearchCleared drops the q param', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    component.onSearchCleared();
    expect(navigateSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { q: null },
      queryParamsHandling: 'merge',
    }));
  });
});
