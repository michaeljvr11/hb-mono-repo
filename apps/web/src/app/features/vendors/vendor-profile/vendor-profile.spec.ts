import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import type { AuthUser, CartDto, UserDto } from '@hb/shared';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CountryCode,
  CurrencyCode,
  ListingType,
  ProductDto,
  VendorDto,
  VendorStatus,
} from '@hb/shared';

import { PublicVendorProfile } from './vendor-profile';
import { VendorsService } from '../../../core/api/vendors.service';
import { ProductsService } from '../../../core/api/products.service';
import { CartService } from '../../../core/api/cart.service';
import { AnalyticsService } from '../../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../../core/analytics/google-analytics.service';
import { AuthService } from '../../../core/auth/auth.service';

const EMPTY_CART: CartDto = { id: 'cart-1', items: [], totals: [], itemCount: 0, updatedAt: '' };

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_VENDOR: VendorDto = {
  id: 'v1',
  businessName: 'Leko Organics',
  tradingName: 'Leko',
  status: VendorStatus.APPROVED,
  countryCode: CountryCode.SOUTH_AFRICA,
};

const NAMIBIAN_VENDOR: VendorDto = {
  id: 'v2',
  businessName: 'Kalahari Crafts',
  status: VendorStatus.APPROVED,
  countryCode: CountryCode.NAMIBIA,
};

const HONEY: ProductDto = {
  id: 'p1',
  name: 'Organic Fynbos Honey 500g',
  description: 'Sourced from the Western Cape.',
  price: 145,
  currency: CurrencyCode.ZAR,
  stockQuantity: 10,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.VENDOR,
  images: [],
  vendor: { id: 'v1', businessName: 'Leko Organics' },
  categories: [{ id: 'cat-1', name: 'Agriculture' }],
  createdAt: '',
  updatedAt: '',
};

const TEA: ProductDto = {
  id: 'p2',
  name: 'Wild Rooibos Loose Tea',
  description: 'desc',
  price: 65,
  currency: CurrencyCode.ZAR,
  stockQuantity: 20,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.VENDOR,
  images: [],
  vendor: { id: 'v1', businessName: 'Leko Organics' },
  // Shares cat-1 with HONEY and adds a second distinct category.
  categories: [
    { id: 'cat-1', name: 'Agriculture' },
    { id: 'cat-2', name: 'Beverages' },
  ],
  createdAt: '',
  updatedAt: '',
};

// ─── Stub interfaces ──────────────────────────────────────────────────────────

interface VendorsStub {
  getById: ReturnType<typeof vi.fn>;
}

interface ProductsStub {
  list: ReturnType<typeof vi.fn>;
}

interface AuthStub {
  isLoggedIn: ReturnType<typeof vi.fn>;
  currentUser$: BehaviorSubject<AuthUser | UserDto | null>;
}

interface CartStub {
  addItem: ReturnType<typeof vi.fn>;
  cart: ReturnType<typeof signal<CartDto | null>>;
  itemCount: ReturnType<typeof signal<number>>;
}

interface AnalyticsStub {
  track: ReturnType<typeof vi.fn>;
}

interface GaStub {
  addToCart: ReturnType<typeof vi.fn>;
}

function makeStubs(): {
  vendorsStub: VendorsStub;
  productsStub: ProductsStub;
  authStub: AuthStub;
  cartStub: CartStub;
  analyticsStub: AnalyticsStub;
  gaStub: GaStub;
} {
  return {
    vendorsStub: {
      getById: vi.fn(() => of(MOCK_VENDOR)),
    },
    productsStub: {
      list: vi.fn(() => of({ items: [HONEY, TEA], total: 2, page: 1, limit: 100 })),
    },
    authStub: {
      isLoggedIn: vi.fn(() => false),
      currentUser$: new BehaviorSubject<AuthUser | UserDto | null>(null),
    },
    cartStub: {
      addItem: vi.fn(() => of(EMPTY_CART)),
      cart: signal<CartDto | null>(null),
      itemCount: signal(0),
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
  vendorsStub: VendorsStub,
  productsStub: ProductsStub,
  authStub: AuthStub,
  cartStub: CartStub,
  analyticsStub: AnalyticsStub,
  gaStub: GaStub,
  paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>,
): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [PublicVendorProfile],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      provideRouter([]),
      { provide: VendorsService, useValue: vendorsStub },
      { provide: ProductsService, useValue: productsStub },
      { provide: AuthService, useValue: authStub },
      { provide: CartService, useValue: cartStub },
      { provide: AnalyticsService, useValue: analyticsStub },
      { provide: GoogleAnalyticsService, useValue: gaStub },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: paramMap$ },
      },
    ],
  }).compileComponents();
}

// ─── Main suite ───────────────────────────────────────────────────────────────

describe('PublicVendorProfile', () => {
  let fixture: ComponentFixture<PublicVendorProfile>;
  let component: PublicVendorProfile;
  let router: Router;
  let vendorsStub: VendorsStub;
  let productsStub: ProductsStub;
  let authStub: AuthStub;
  let cartStub: CartStub;
  let analyticsStub: AnalyticsStub;
  let gaStub: GaStub;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    ({ vendorsStub, productsStub, authStub, cartStub, analyticsStub, gaStub } = makeStubs());
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'v1' }));

    await setupTestBed(
      vendorsStub,
      productsStub,
      authStub,
      cartStub,
      analyticsStub,
      gaStub,
      paramMap$,
    );

    fixture = TestBed.createComponent(PublicVendorProfile);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('fetches the vendor by the :id route param', () => {
    expect(vendorsStub.getById).toHaveBeenCalledWith('v1');
  });

  it('renders the vendor hero and a product-card per loaded product', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Leko Organics');
    expect(el.querySelectorAll('app-product-card').length).toBe(2);
  });

  it('fetches products filtered by vendorId, never unfiltered, capped at the server max page size', () => {
    expect(productsStub.list).toHaveBeenCalledWith({ vendorId: 'v1', limit: 100 });
  });

  it('renders a not-found state without a product grid when getById 404s', async () => {
    vendorsStub.getById.mockReturnValue(throwError(() => ({ status: 404 })));
    paramMap$.next(convertToParamMap({ id: 'missing' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("We couldn't find that vendor.");
    expect(el.querySelectorAll('app-product-card').length).toBe(0);
  });

  it('renders a generic error state on a non-404 vendor failure', async () => {
    vendorsStub.getById.mockReturnValue(throwError(() => ({ status: 500 })));
    paramMap$.next(convertToParamMap({ id: 'boom' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Could not load this vendor right now');
  });

  it('sets not-found state when there is no :id route param', async () => {
    paramMap$.next(convertToParamMap({}));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.state()).toBe('not-found');
  });

  it('renders an empty state when the vendor has no products', async () => {
    productsStub.list.mockReturnValue(of({ items: [], total: 0, page: 1, limit: 100 }));
    paramMap$.next(convertToParamMap({ id: 'v1' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("doesn't have any listings yet");
    expect(el.querySelectorAll('app-product-card').length).toBe(0);
  });

  it('de-dupes categoryChips across products by id, first-seen order', () => {
    expect(component.categoryChips().map((c) => c.id)).toEqual(['cat-1', 'cat-2']);
  });

  it('maps NAMIBIA country code to the "Namibia" label', async () => {
    vendorsStub.getById.mockReturnValue(of(NAMIBIAN_VENDOR));
    productsStub.list.mockReturnValue(of({ items: [], total: 0, page: 1, limit: 100 }));
    paramMap$.next(convertToParamMap({ id: 'v2' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.countryLabel()).toBe('Namibia');
  });

  it('maps any non-Namibia country code to the "South Africa" label', () => {
    expect(component.countryLabel()).toBe('South Africa');
  });

  it('anonymous onAddToCart routes to /login with the current returnUrl', () => {
    authStub.isLoggedIn.mockReturnValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onAddToCart(HONEY);

    expect(navigateSpy).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: router.url },
    });
    expect(cartStub.addItem).not.toHaveBeenCalled();
  });

  it('authenticated onAddToCart calls the cart API with the product id', () => {
    authStub.isLoggedIn.mockReturnValue(true);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onAddToCart(HONEY);

    expect(cartStub.addItem).toHaveBeenCalledWith('p1');
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
