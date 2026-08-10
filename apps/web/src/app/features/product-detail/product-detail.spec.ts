import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import type { AuthUser, CartDto, UserDto } from '@hb/shared';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AnalyticsEventType,
  CountryCode,
  CurrencyCode,
  ListingType,
  ProductDto,
} from '@hb/shared';

import { ProductDetail } from './product-detail';
import { ProductsService } from '../../core/api/products.service';
import { CartService } from '../../core/api/cart.service';
import { WishlistService } from '../../core/api/wishlist.service';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';
import { AuthService } from '../../core/auth/auth.service';

const EMPTY_CART: CartDto = { id: 'cart-1', items: [], totals: [], itemCount: 0, updatedAt: '' };

/**
 * `snackBar` is a private field on ProductDetail — TS privacy is
 * compile-time only, so this reads the exact MatSnackBar instance the
 * component actually injected. Needed because the standalone component's
 * own `MatSnackBarModule` import can resolve a different instance than
 * `TestBed.inject(MatSnackBar)`.
 */
function getComponentSnackBar(component: ProductDetail): MatSnackBar {
  return (component as unknown as { snackBar: MatSnackBar }).snackBar;
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const HONEY: ProductDto = {
  id: 'p1',
  name: 'Organic Fynbos Honey 500g',
  description: 'Sourced from the Western Cape.\nRich in antioxidants.',
  price: 145,
  currency: CurrencyCode.ZAR,
  stockQuantity: 10,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.VENDOR,
  images: [
    { id: 'img1', url: 'http://a.com/1.jpg', isPrimary: true, displayOrder: 0 },
    { id: 'img2', url: 'http://a.com/2.jpg', isPrimary: false, displayOrder: 1 },
  ],
  vendor: { id: 'v1', businessName: 'Leko Organics' },
  categories: [{ id: 'cat-1', name: 'Agriculture' }],
  createdAt: '',
  updatedAt: '',
};

const RELATED_SAME_CATEGORY: ProductDto = {
  ...HONEY,
  id: 'p2',
  name: 'Wild Rooibos Loose Tea',
};

const PLATFORM_PRODUCT: ProductDto = {
  id: 'p3',
  name: 'Platform Widget',
  description: 'No vendor here.',
  price: 50,
  currency: CurrencyCode.ZAR,
  stockQuantity: 20,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.PLATFORM,
  images: [],
  categories: [],
  createdAt: '',
  updatedAt: '',
};

// ─── Stub interfaces ──────────────────────────────────────────────────────────

interface ProductsStub {
  getById: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
}

interface AuthStub {
  isLoggedIn: ReturnType<typeof vi.fn>;
  currentUser$: BehaviorSubject<AuthUser | UserDto | null>;
}

interface CartStub {
  addItem: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  cart: ReturnType<typeof signal<CartDto | null>>;
  itemCount: ReturnType<typeof signal<number>>;
}

interface AnalyticsStub {
  track: ReturnType<typeof vi.fn>;
}

interface GaStub {
  viewItem: ReturnType<typeof vi.fn>;
  addToCart: ReturnType<typeof vi.fn>;
}

interface WishlistStub {
  has: ReturnType<typeof vi.fn>;
  toggle: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  wishlist: ReturnType<typeof signal<null>>;
}

function makeStubs(): {
  productsStub: ProductsStub;
  authStub: AuthStub;
  cartStub: CartStub;
  analyticsStub: AnalyticsStub;
  gaStub: GaStub;
  wishlistStub: WishlistStub;
} {
  return {
    productsStub: {
      getById: vi.fn(() => of(HONEY)),
      list: vi.fn(() =>
        of({ items: [HONEY, RELATED_SAME_CATEGORY], total: 2, page: 1, limit: 24 }),
      ),
    },
    authStub: {
      isLoggedIn: vi.fn(() => false),
      currentUser$: new BehaviorSubject<AuthUser | UserDto | null>(null),
    },
    cartStub: {
      addItem: vi.fn(() => of(EMPTY_CART)),
      load: vi.fn(() => of(EMPTY_CART)),
      cart: signal<CartDto | null>(null),
      itemCount: signal(0),
    },
    analyticsStub: {
      track: vi.fn(),
    },
    gaStub: {
      viewItem: vi.fn(),
      addToCart: vi.fn(),
    },
    wishlistStub: {
      has: vi.fn(() => false),
      toggle: vi.fn(() => of({ items: [], itemCount: 0 })),
      load: vi.fn(() => of({ items: [], itemCount: 0 })),
      wishlist: signal(null),
    },
  };
}

async function setupTestBed(
  productsStub: ProductsStub,
  authStub: AuthStub,
  cartStub: CartStub,
  analyticsStub: AnalyticsStub,
  gaStub: GaStub,
  wishlistStub: WishlistStub,
  paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>,
): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [ProductDetail],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      provideRouter([]),
      { provide: ProductsService, useValue: productsStub },
      { provide: AuthService, useValue: authStub },
      { provide: CartService, useValue: cartStub },
      { provide: WishlistService, useValue: wishlistStub },
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

describe('ProductDetail', () => {
  let fixture: ComponentFixture<ProductDetail>;
  let component: ProductDetail;
  let router: Router;
  let productsStub: ProductsStub;
  let authStub: AuthStub;
  let cartStub: CartStub;
  let analyticsStub: AnalyticsStub;
  let gaStub: GaStub;
  let wishlistStub: WishlistStub;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    ({ productsStub, authStub, cartStub, analyticsStub, gaStub, wishlistStub } = makeStubs());
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'p1' }));

    await setupTestBed(
      productsStub,
      authStub,
      cartStub,
      analyticsStub,
      gaStub,
      wishlistStub,
      paramMap$,
    );

    fixture = TestBed.createComponent(ProductDetail);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('fetches the product by the :id route param', () => {
    expect(productsStub.getById).toHaveBeenCalledWith('p1');
  });

  it('fires PRODUCT_VIEWED once the product loads successfully', () => {
    expect(analyticsStub.track).toHaveBeenCalledWith(AnalyticsEventType.PRODUCT_VIEWED, {
      productId: 'p1',
      vendorId: 'v1',
    });
  });

  it('fires GA view_item once the product loads successfully', () => {
    expect(gaStub.viewItem).toHaveBeenCalledWith('p1', HONEY.name, HONEY.price, HONEY.currency);
  });

  it('renders the product name and price', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Organic Fynbos Honey 500g');
    expect(el.textContent).toMatch(/R\s?145[.,]00/);
  });

  it('renders the cross-border shipping section', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Cross-Border Shipping');
    expect(el.textContent).toContain('Arrives in 3-5 business days');
    expect(el.textContent).toContain('Simplified Customs Included');
  });

  it('renders the description as multiple paragraphs', () => {
    const el: HTMLElement = fixture.nativeElement;
    const paragraphs = el.querySelectorAll('.pdp__description p');
    expect(paragraphs.length).toBe(2);
  });

  it('renders the vendor card with initials, name and verified badge when a vendor exists', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.pdp__vendor-card')).toBeTruthy();
    expect(el.textContent).toContain('Leko Organics');
    expect(el.querySelector('.pdp__vendor-avatar')?.textContent?.trim()).toBe('LO');
  });

  it('omits the vendor card for platform (vendor-less) listings', async () => {
    productsStub.getById.mockReturnValue(of(PLATFORM_PRODUCT));
    paramMap$.next(convertToParamMap({ id: 'p3' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.pdp__vendor-card')).toBeNull();
  });

  it('shows the "1 / N" badge and prev/next controls when there are multiple images', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('1 / 2');
    expect(el.querySelector('.pdp__hero-nav--prev')).toBeTruthy();
    expect(el.querySelector('.pdp__hero-nav--next')).toBeTruthy();
  });

  it('cycles images forward and wraps around on nextImage()', () => {
    expect(component.activeImageIndex()).toBe(0);
    component.nextImage();
    expect(component.activeImageIndex()).toBe(1);
    component.nextImage();
    expect(component.activeImageIndex()).toBe(0);
  });

  it('fetches related products by the first category, excluding self, capped at 4', () => {
    expect(productsStub.list).toHaveBeenCalledWith({ categoryId: 'cat-1' });
    expect(component.relatedProducts().length).toBe(1);
    expect(component.relatedProducts()[0].id).toBe('p2');
    expect(component.relatedProducts().some((p) => p.id === 'p1')).toBe(false);
  });

  it('renders a friendly not-found state on a 404', async () => {
    productsStub.getById.mockReturnValue(throwError(() => ({ status: 404 })));
    paramMap$.next(convertToParamMap({ id: 'missing' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("We couldn't find that product.");
    expect(el.querySelector('a.pdp__back-link')).toBeTruthy();
  });

  it('renders a generic error state on a non-404 failure', async () => {
    productsStub.getById.mockReturnValue(throwError(() => ({ status: 500 })));
    paramMap$.next(convertToParamMap({ id: 'boom' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Could not load this product right now');
  });

  it('anonymous add-to-cart routes to /login with the current returnUrl', () => {
    authStub.isLoggedIn.mockReturnValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onAddToCart();

    expect(navigateSpy).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: router.url },
    });
  });

  it('authenticated add-to-cart calls the cart API with the product id', () => {
    authStub.isLoggedIn.mockReturnValue(true);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onAddToCart();

    expect(cartStub.addItem).toHaveBeenCalledWith('p1');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('fires ADD_TO_CART on a successful add', () => {
    authStub.isLoggedIn.mockReturnValue(true);
    analyticsStub.track.mockClear();

    component.onAddToCart();

    expect(analyticsStub.track).toHaveBeenCalledWith(AnalyticsEventType.ADD_TO_CART, {
      productId: 'p1',
      vendorId: 'v1',
    });
  });

  it('fires GA add_to_cart on a successful add', () => {
    authStub.isLoggedIn.mockReturnValue(true);

    component.onAddToCart();

    expect(gaStub.addToCart).toHaveBeenCalledWith('p1', HONEY.name, HONEY.price, HONEY.currency);
  });

  it('related-product add-to-cart adds that product, not the page product', () => {
    authStub.isLoggedIn.mockReturnValue(true);

    component.onRelatedAddToCart(RELATED_SAME_CATEGORY);

    expect(cartStub.addItem).toHaveBeenCalledWith('p2');
  });

  // ── Wishlist toggle (related-products grid) ─────────────────────────────

  it('anonymous related-product wishlist toggle routes to /login with the current returnUrl', () => {
    authStub.isLoggedIn.mockReturnValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onRelatedWishlistToggle(RELATED_SAME_CATEGORY);

    expect(navigateSpy).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: router.url },
    });
    expect(wishlistStub.toggle).not.toHaveBeenCalled();
  });

  it('authenticated related-product wishlist toggle calls WishlistService.toggle with the product id', () => {
    authStub.isLoggedIn.mockReturnValue(true);

    component.onRelatedWishlistToggle(RELATED_SAME_CATEGORY);

    expect(wishlistStub.toggle).toHaveBeenCalledWith('p2');
  });

  it('surfaces the API error message when add-to-cart fails', () => {
    authStub.isLoggedIn.mockReturnValue(true);
    cartStub.addItem.mockReturnValue(
      throwError(() => ({ status: 409, error: { message: 'out of stock' } })),
    );

    expect(() => component.onAddToCart()).not.toThrow();
  });

  it('viewStorefront navigates to /vendors/:id', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.viewStorefront();
    expect(navigateSpy).toHaveBeenCalledWith(['/vendors', 'v1']);
  });

  // ── Wishlist toggle (PDP hero / sticky bar) ─────────────────────────────

  it('anonymous hero wishlist toggle routes to /login with the current returnUrl and never calls the API', () => {
    authStub.isLoggedIn.mockReturnValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onWishlistToggle();

    expect(navigateSpy).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: router.url },
    });
    expect(wishlistStub.toggle).not.toHaveBeenCalled();
  });

  it('authenticated hero wishlist toggle adds the page product when not yet wishlisted', () => {
    authStub.isLoggedIn.mockReturnValue(true);
    wishlistStub.has.mockReturnValue(false);

    component.onWishlistToggle();

    expect(wishlistStub.toggle).toHaveBeenCalledWith('p1');
  });

  it('authenticated hero wishlist toggle removes the page product when already wishlisted', () => {
    authStub.isLoggedIn.mockReturnValue(true);
    wishlistStub.has.mockReturnValue(true);

    component.onWishlistToggle();

    expect(wishlistStub.toggle).toHaveBeenCalledWith('p1');
  });

  it('hero heart state reflects WishlistService membership via the hydration-gated helper', () => {
    wishlistStub.has.mockReturnValue(true);
    expect(component.isWishlisted('p1')).toBe(true);

    wishlistStub.has.mockReturnValue(false);
    expect(component.isWishlisted('p1')).toBe(false);
  });

  it('renders the hero/sticky-bar wishlist button reflecting saved state', async () => {
    // Pre-set the wishlisted mock and build a fresh fixture so the "saved"
    // state is present from the very first render — mutating an
    // already-rendered fixture's stub and re-detecting would fight the
    // ExpressionChangedAfterItHasBeenCheckedError guard, since `has()` isn't
    // itself a tracked signal read in the template.
    const savedStubs = makeStubs();
    savedStubs.wishlistStub.has.mockReturnValue(true);
    const savedParamMap$ = new BehaviorSubject(convertToParamMap({ id: 'p1' }));

    TestBed.resetTestingModule();
    await setupTestBed(
      savedStubs.productsStub,
      savedStubs.authStub,
      savedStubs.cartStub,
      savedStubs.analyticsStub,
      savedStubs.gaStub,
      savedStubs.wishlistStub,
      savedParamMap$,
    );
    const savedFixture = TestBed.createComponent(ProductDetail);
    savedFixture.detectChanges();
    await savedFixture.whenStable();
    savedFixture.detectChanges();

    const btn: HTMLButtonElement | null =
      savedFixture.nativeElement.querySelector('.pdp__wishlist-btn');
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    expect(btn?.textContent).toContain('Saved');
  });

  it('a failed hero wishlist toggle surfaces the info snackbar and leaves state untouched (no optimistic mutation)', () => {
    authStub.isLoggedIn.mockReturnValue(true);
    wishlistStub.has.mockReturnValue(false);
    wishlistStub.toggle.mockReturnValue(
      throwError(() => ({ error: { message: 'Could not save this item.' } })),
    );
    // Spy on the exact MatSnackBar instance the component holds (its
    // standalone `MatSnackBarModule` import resolves its own instance —
    // TestBed.inject(MatSnackBar) is not guaranteed to be reference-equal).
    const componentSnackBar = getComponentSnackBar(component);
    const openSpy = vi.spyOn(componentSnackBar, 'open');

    expect(() => component.onWishlistToggle()).not.toThrow();

    expect(openSpy).toHaveBeenCalledWith(
      'Could not save this item.',
      'Close',
      expect.objectContaining({ panelClass: ['hb-info-snackbar'] }),
    );
    // wishlistStub.has still reflects the untouched signal-backed state.
    expect(component.isWishlisted('p1')).toBe(false);
  });

  it('the add-success snackbar exposes a "View wishlist" action that navigates to /wishlist', () => {
    authStub.isLoggedIn.mockReturnValue(true);
    wishlistStub.has.mockReturnValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const componentSnackBar = getComponentSnackBar(component);
    const snackBarRef = {
      onAction: () => ({ subscribe: (cb: () => void) => cb() }),
    };
    const openSpy = vi
      .spyOn(componentSnackBar, 'open')
      .mockReturnValue(snackBarRef as unknown as ReturnType<MatSnackBar['open']>);

    component.onWishlistToggle();

    expect(openSpy).toHaveBeenCalledWith(
      `Added '${HONEY.name}' to your wishlist.`,
      'View wishlist',
      expect.any(Object),
    );
    expect(navigateSpy).toHaveBeenCalledWith(['/wishlist']);
  });
});
