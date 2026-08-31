import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import type {
  AuthUser,
  CartDto,
  ProductReviewListDto,
  ReviewDto,
  ReviewEligibilityDto,
  UserDto,
} from '@hb/shared';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AnalyticsEventType,
  CountryCode,
  CurrencyCode,
  ListingType,
  ProductDto,
  ReviewIneligibilityReason,
} from '@hb/shared';

import { ProductDetail } from './product-detail';
import { ProductsService } from '../../core/api/products.service';
import { CartService } from '../../core/api/cart.service';
import { WishlistService } from '../../core/api/wishlist.service';
import { ReviewsService } from '../../core/api/reviews.service';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationService } from '../../core/notifications/notification.service';

const EMPTY_CART: CartDto = { id: 'cart-1', items: [], totals: [], itemCount: 0, updatedAt: '' };

const REVIEWS_PAGE_1: ProductReviewListDto = {
  items: [
    {
      id: 'r1',
      productId: 'p1',
      rating: 5,
      body: 'Amazing honey.\nWill buy again.',
      authorName: 'Michael J.',
      isVerifiedPurchase: true,
      createdAt: '2026-07-07T09:00:00.000Z',
      updatedAt: '2026-07-07T09:00:00.000Z',
    },
    {
      id: 'r2',
      productId: 'p1',
      rating: 4,
      body: 'Contains a <b>bold</b> claim about taste.',
      authorName: 'Anon B.',
      isVerifiedPurchase: false,
      createdAt: '2026-07-01T09:00:00.000Z',
      updatedAt: '2026-07-01T09:00:00.000Z',
    },
  ],
  total: 3,
  page: 1,
  limit: 10,
  summary: { averageRating: 4.5, reviewCount: 3 },
};

/** Post-404 refetch state: `r1` (the caller's own review) is gone — mirrors what the
 * server would actually return after a 404 on edit/delete, so the "review no longer
 * available" tests exercise a refetch that agrees with the error rather than one that
 * still shows `r1` present and `already_reviewed`. */
const REVIEWS_PAGE_1_WITHOUT_R1: ProductReviewListDto = {
  items: [REVIEWS_PAGE_1.items[1]],
  total: 2,
  page: 1,
  limit: 10,
  summary: { averageRating: 4, reviewCount: 2 },
};

const REVIEWS_EMPTY: ProductReviewListDto = {
  items: [],
  total: 0,
  page: 1,
  limit: 10,
  summary: { averageRating: null, reviewCount: 0 },
};

const ELIGIBLE: ReviewEligibilityDto = { canReview: true, reason: null };

const NOT_PURCHASED: ReviewEligibilityDto = {
  canReview: false,
  reason: ReviewIneligibilityReason.NOT_PURCHASED,
};

const OWN_LISTING: ReviewEligibilityDto = {
  canReview: false,
  reason: ReviewIneligibilityReason.OWN_LISTING,
};

/** Matches `r1` in REVIEWS_PAGE_1 — the "found on current page" case. */
const ALREADY_REVIEWED_ON_PAGE: ReviewEligibilityDto = {
  canReview: false,
  reason: ReviewIneligibilityReason.ALREADY_REVIEWED,
  existingReviewId: 'r1',
};

/** Not present in REVIEWS_PAGE_1 — the "on another page" fallback case. */
const ALREADY_REVIEWED_OFF_PAGE: ReviewEligibilityDto = {
  canReview: false,
  reason: ReviewIneligibilityReason.ALREADY_REVIEWED,
  existingReviewId: 'not-on-this-page',
};

const NEW_REVIEW: ReviewDto = {
  id: 'r3',
  productId: 'p1',
  rating: 5,
  body: 'Solid product overall, would buy again for sure.',
  authorName: 'Buyer C.',
  isVerifiedPurchase: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

/** The edited version of `r1` (matches ALREADY_REVIEWED_ON_PAGE's existingReviewId). */
const EDITED_REVIEW: ReviewDto = {
  id: 'r1',
  productId: 'p1',
  rating: 3,
  body: 'Updated opinion after using it for a month.',
  authorName: 'Michael J.',
  isVerifiedPurchase: true,
  createdAt: '2026-07-07T09:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
};

/**
 * `notificationService` is a private field on ProductDetail — TS privacy is
 * compile-time only, so this reads the exact NotificationService instance
 * the component actually injected (it's `providedIn: 'root'`, so this is
 * reference-equal to `TestBed.inject(NotificationService)`, but reading it
 * off the component keeps the test independent of that implementation detail).
 */
function getComponentNotificationService(component: ProductDetail): NotificationService {
  return (component as unknown as { notificationService: NotificationService })
    .notificationService;
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
  itemCount: ReturnType<typeof signal<number>>;
}

interface ReviewsStub {
  getReviews: ReturnType<typeof vi.fn>;
  checkEligibility: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  reviews: ReturnType<typeof signal<ProductReviewListDto | null>>;
}

function makeStubs(): {
  productsStub: ProductsStub;
  authStub: AuthStub;
  cartStub: CartStub;
  analyticsStub: AnalyticsStub;
  gaStub: GaStub;
  wishlistStub: WishlistStub;
  reviewsStub: ReviewsStub;
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
      itemCount: signal(0),
    },
    reviewsStub: {
      getReviews: vi.fn(() => of(REVIEWS_PAGE_1)),
      checkEligibility: vi.fn(() => of(NOT_PURCHASED)),
      submit: vi.fn(() => of(NEW_REVIEW)),
      update: vi.fn(() => of(EDITED_REVIEW)),
      delete: vi.fn(() => of(undefined)),
      reviews: signal<ProductReviewListDto | null>(null),
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
  reviewsStub: ReviewsStub,
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
      { provide: ReviewsService, useValue: reviewsStub },
      { provide: AnalyticsService, useValue: analyticsStub },
      { provide: GoogleAnalyticsService, useValue: gaStub },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: paramMap$ },
      },
    ],
  }).compileComponents();
}

/**
 * Builds a fresh fixture (own `hydrated` gate, own stubs) via
 * `TestBed.resetTestingModule()` — the same pattern the "saved" wishlist
 * fixture above uses — so auth/eligibility state can be set up before the
 * component's first render, rather than fighting `ExpressionChangedAfter...`
 * by mutating an already-rendered fixture's stubs.
 */
async function buildFixture(overrides: {
  isLoggedIn?: boolean;
  eligibility?: ReviewEligibilityDto;
} = {}): Promise<{
  fixture: ComponentFixture<ProductDetail>;
  component: ProductDetail;
  router: Router;
  reviewsStub: ReviewsStub;
  authStub: AuthStub;
}> {
  const stubs = makeStubs();
  if (overrides.isLoggedIn !== undefined) {
    stubs.authStub.isLoggedIn.mockReturnValue(overrides.isLoggedIn);
  }
  if (overrides.eligibility) {
    stubs.reviewsStub.checkEligibility.mockReturnValue(of(overrides.eligibility));
  }
  const pm$ = new BehaviorSubject(convertToParamMap({ id: 'p1' }));

  TestBed.resetTestingModule();
  await setupTestBed(
    stubs.productsStub,
    stubs.authStub,
    stubs.cartStub,
    stubs.analyticsStub,
    stubs.gaStub,
    stubs.wishlistStub,
    stubs.reviewsStub,
    pm$,
  );

  const fx = TestBed.createComponent(ProductDetail);
  fx.detectChanges();
  await fx.whenStable();
  fx.detectChanges();

  return {
    fixture: fx,
    component: fx.componentInstance,
    router: TestBed.inject(Router),
    reviewsStub: stubs.reviewsStub,
    authStub: stubs.authStub,
  };
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
  let reviewsStub: ReviewsStub;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    ({ productsStub, authStub, cartStub, analyticsStub, gaStub, wishlistStub, reviewsStub } =
      makeStubs());
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'p1' }));

    await setupTestBed(
      productsStub,
      authStub,
      cartStub,
      analyticsStub,
      gaStub,
      wishlistStub,
      reviewsStub,
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

  // Regression tests for the CP1252/UTF-8 mis-decode that rendered
  // "Loading productâ€¦" / "Loading reviewsâ€¦" to users. `â€` is the signature
  // byte sequence of that corruption class.
  //
  // The loaded state is not enough on its own: both corrupted strings live in
  // the *loading* branch, which has already been replaced by the time the
  // default fixture settles. So the loading state is held open deliberately
  // here with an observable that never emits.
  it('renders the loading state with a real ellipsis, not mojibake', async () => {
    productsStub.getById.mockReturnValue(new Subject());
    paramMap$.next(convertToParamMap({ id: 'pending' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Loading product…');
    expect(el.textContent).not.toContain('â€');
  });

  it('renders no mojibake once the product has loaded', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain('â€');
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

  it('renders the vendor card with initials and name, and no verification badge, when a vendor exists', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.pdp__vendor-card')).toBeTruthy();
    expect(el.textContent).toContain('Leko Organics');
    expect(el.querySelector('.pdp__vendor-avatar')?.textContent?.trim()).toBe('LO');
    // Every publicly visible vendor is approved by construction, so a verification
    // mark on the vendor card carries no information — same reason the badge was
    // dropped from the product card, the PDP hero and the vendor showcase.
    expect(el.querySelector('.pdp__vendor-verified')).toBeNull();
    expect(el.querySelector('[aria-label="Verified vendor"]')).toBeNull();
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

  it('renders the hero image with a plain src and no srcset when the image has no variants (legacy row)', () => {
    const el: HTMLElement = fixture.nativeElement;
    const img = el.querySelector('.pdp__hero-image') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe('http://a.com/1.jpg');
    expect(img.getAttribute('srcset')).toBeNull();
    expect(img.hasAttribute('width')).toBe(false);
    expect(img.hasAttribute('height')).toBe(false);
  });

  it('renders the hero image with srcset/sizes/width/height when variants are present, and never lazy-loads it', async () => {
    const withVariants: ProductDto = {
      ...HONEY,
      images: [
        {
          id: 'img1',
          url: 'http://a.com/full.webp',
          isPrimary: true,
          displayOrder: 0,
          width: 2000,
          height: 2000,
          sizeBytes: 999,
          variants: {
            thumbnail: { url: 'http://a.com/thumb.webp', width: 300, height: 300, sizeBytes: 10 },
            card: { url: 'http://a.com/card.webp', width: 800, height: 800, sizeBytes: 40 },
            full: { url: 'http://a.com/full.webp', width: 2000, height: 2000, sizeBytes: 999 },
          },
        },
      ],
    };
    productsStub.getById.mockReturnValue(of(withVariants));
    paramMap$.next(convertToParamMap({ id: 'p1' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const img = el.querySelector('.pdp__hero-image') as HTMLImageElement;
    expect(img.src).toBe('http://a.com/full.webp');
    expect(img.getAttribute('srcset')).toBe(
      'http://a.com/thumb.webp 300w, http://a.com/card.webp 800w, http://a.com/full.webp 2000w',
    );
    expect(img.getAttribute('sizes')).toBe('(min-width: 1280px) 1280px, 100vw');
    expect(img.getAttribute('width')).toBe('2000');
    expect(img.getAttribute('height')).toBe('2000');
    expect(img.hasAttribute('loading')).toBe(false);
    expect(img.getAttribute('fetchpriority')).toBe('high');
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

  it('the hydration gate starts closed: isWishlisted reads false immediately after construction, before any render', () => {
    // WishlistService already reports membership, but the SSR-rendered
    // markup and the client's pre-hydration DOM must still agree on an
    // empty heart. `hydrated` only flips inside the `afterNextRender`
    // callback registered in the constructor, which requires an actual
    // render pass — checking immediately after construction, before any
    // `detectChanges()`, is the one place it can't have fired yet (unlike
    // the test above, which runs after the shared `beforeEach` has already
    // hydrated the fixture). If the gate were ever dropped (`isWishlisted`
    // calling `has()` directly), this would read `true` here and fail.
    wishlistStub.has.mockReturnValue(true);
    const freshComponent = TestBed.createComponent(ProductDetail).componentInstance;

    expect(freshComponent.isWishlisted('p1')).toBe(false);
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
      savedStubs.reviewsStub,
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

  it('a failed hero wishlist toggle surfaces the error notification and leaves state untouched (no optimistic mutation)', () => {
    authStub.isLoggedIn.mockReturnValue(true);
    wishlistStub.has.mockReturnValue(false);
    wishlistStub.toggle.mockReturnValue(
      throwError(() => ({ error: { message: 'Could not save this item.' } })),
    );
    const notificationService = getComponentNotificationService(component);
    const errorSpy = vi.spyOn(notificationService, 'error');

    expect(() => component.onWishlistToggle()).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith('Could not save this item.');
    // wishlistStub.has still reflects the untouched signal-backed state.
    expect(component.isWishlisted('p1')).toBe(false);
  });

  it('the add-success notification exposes a "View wishlist" action that navigates to /wishlist', () => {
    authStub.isLoggedIn.mockReturnValue(true);
    wishlistStub.has.mockReturnValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const notificationService = getComponentNotificationService(component);
    const snackBarRef = {
      onAction: () => ({ subscribe: (cb: () => void) => cb() }),
    };
    const successSpy = vi
      .spyOn(notificationService, 'success')
      .mockReturnValue(snackBarRef as unknown as ReturnType<NotificationService['success']>);

    component.onWishlistToggle();

    expect(successSpy).toHaveBeenCalledWith(
      `Added '${HONEY.name}' to your wishlist.`,
      'View wishlist',
    );
    expect(navigateSpy).toHaveBeenCalledWith(['/wishlist']);
  });

  // ── Reviews tab ──────────────────────────────────────────────────────────

  describe('reviews tab', () => {
    it('fetches page 1 of reviews eagerly, independent of the product load, with the right params', () => {
      expect(reviewsStub.getReviews).toHaveBeenCalledWith('p1', { page: 1, limit: 10 });
    });

    it('renders a hand-rolled tablist with a single "Reviews (N)" tab and correct a11y wiring', () => {
      const el: HTMLElement = fixture.nativeElement;
      const tablist = el.querySelector('[role="tablist"]');
      const tab = el.querySelector('[role="tab"]');
      const panel = el.querySelector('[role="tabpanel"]');

      expect(tablist).toBeTruthy();
      expect(tab).toBeTruthy();
      expect(tab?.textContent).toContain('Reviews (3)');
      expect(tab?.getAttribute('aria-selected')).toBe('true');
      expect(tab?.getAttribute('aria-controls')).toBe(panel?.id);
      expect(panel?.getAttribute('aria-labelledby')).toBe(tab?.id);
    });

    it('renders the summary header with the one-decimal average and a "N reviews" count', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.pdp__reviews-summary-score')?.textContent?.trim()).toBe('4.5');
      expect(el.querySelector('.pdp__reviews-summary-count')?.textContent).toContain('3 reviews');
      expect(el.querySelectorAll('.pdp__reviews-summary .pdp__reviews-star--filled').length).toBe(
        5,
      );
    });

    it('renders a friendly "No reviews yet" empty state and never renders "0.0 stars" when reviewCount is 0', async () => {
      reviewsStub.getReviews.mockReturnValue(of(REVIEWS_EMPTY));
      paramMap$.next(convertToParamMap({ id: 'p1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('No reviews yet.');
      expect(el.querySelector('.pdp__reviews-summary')).toBeNull();
      expect(el.textContent).not.toContain('0.0');
    });

    it('shows the Verified Purchase badge only on verified reviews', () => {
      const el: HTMLElement = fixture.nativeElement;
      const badges = el.querySelectorAll('.pdp__review-verified');
      expect(badges.length).toBe(1);
      expect(badges[0].textContent).toContain('Verified Purchase');
    });

    it('splits a review body on \\n into separate paragraph elements without using innerHTML (no markdown/HTML interpretation)', () => {
      const el: HTMLElement = fixture.nativeElement;
      const firstReviewParagraphs = el.querySelectorAll('.pdp__review-body p');
      expect(firstReviewParagraphs.length).toBe(3); // 2 for r1, 1 for r2
      expect(firstReviewParagraphs[0].textContent).toBe('Amazing honey.');
      expect(firstReviewParagraphs[1].textContent).toBe('Will buy again.');

      // r2's body contains literal "<b>bold</b>" — it must render as escaped
      // text, never as an actual <b> element (that would mean innerHTML/markdown
      // interpretation was used instead of Angular's default text interpolation).
      expect(firstReviewParagraphs[2].textContent).toContain('<b>bold</b>');
      expect(firstReviewParagraphs[2].querySelector('b')).toBeNull();
    });

    it('paginates: clicking Next fetches the next page with the right params and advances the page status', async () => {
      const el: HTMLElement = fixture.nativeElement;
      // 3 total reviews at limit 10 -> 1 page, so no pagination controls yet.
      expect(el.querySelector('.pdp__reviews-pagination')).toBeNull();

      reviewsStub.getReviews.mockReturnValue(
        of({ ...REVIEWS_PAGE_1, total: 25, page: 1 } satisfies ProductReviewListDto),
      );
      paramMap$.next(convertToParamMap({ id: 'p1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const nextBtn = fixture.nativeElement.querySelectorAll(
        '.pdp__reviews-page-btn',
      )[1] as HTMLButtonElement;
      expect(nextBtn.textContent).toContain('Next');

      reviewsStub.getReviews.mockReturnValue(
        of({ ...REVIEWS_PAGE_1, total: 25, page: 2 } satisfies ProductReviewListDto),
      );
      nextBtn.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(reviewsStub.getReviews).toHaveBeenCalledWith('p1', { page: 2, limit: 10 });
      expect(component.reviewsPage()).toBe(2);
      expect(fixture.nativeElement.querySelector('.pdp__reviews-page-status')?.textContent).toContain(
        'Page 2 of 3',
      );
    });

    it('shows a distinct loading state while the request is in flight', async () => {
      const pending$ = new Subject<ProductReviewListDto>();
      reviewsStub.getReviews.mockReturnValue(pending$);
      paramMap$.next(convertToParamMap({ id: 'p1' }));
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('Loading reviews');

      pending$.next(REVIEWS_PAGE_1);
      pending$.complete();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Loading reviews');
    });

    it('shows a distinct error state on a failed fetch — never conflated with the empty state', async () => {
      reviewsStub.getReviews.mockReturnValue(throwError(() => ({ status: 500 })));
      paramMap$.next(convertToParamMap({ id: 'p1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('Could not load reviews right now');
      expect(el.querySelector('[role="alert"]')).toBeTruthy();
      expect(el.textContent).not.toContain('No reviews yet.');
    });
  });

  // ── Write a review (PR-4) ────────────────────────────────────────────────

  describe('write a review', () => {
    it('never calls the eligibility endpoint for anonymous visitors, and shows a sign-in CTA that routes through sanitizeReturnUrl', async () => {
      const { fixture: fx, router: r, reviewsStub: rs } = await buildFixture({
        isLoggedIn: false,
      });

      expect(rs.checkEligibility).not.toHaveBeenCalled();

      const el: HTMLElement = fx.nativeElement;
      const cta = el.querySelector('.pdp__review-signin-btn') as HTMLButtonElement;
      expect(cta).toBeTruthy();
      expect(el.querySelector('.pdp__review-form-card')).toBeNull();

      const navigateSpy = vi.spyOn(r, 'navigate').mockResolvedValue(true);
      cta.click();
      fx.detectChanges();

      expect(navigateSpy).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: r.url },
      });
    });

    it('the hydration gate starts closed for reviews too: isAuthenticated reads false immediately after construction, before any render', () => {
      authStub.isLoggedIn.mockReturnValue(true);
      const freshComponent = TestBed.createComponent(ProductDetail).componentInstance;

      expect(freshComponent.isAuthenticated()).toBe(false);
      expect(reviewsStub.checkEligibility).not.toHaveBeenCalled();
    });

    it('renders the write-review form only when the API says canReview: true', async () => {
      const { fixture: fx, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ELIGIBLE,
      });

      expect(rs.checkEligibility).toHaveBeenCalledWith('p1');
      const el: HTMLElement = fx.nativeElement;
      expect(el.querySelector('.pdp__review-form-card')).toBeTruthy();
      expect(el.querySelector('.pdp__review-signin-btn')).toBeNull();
    });

    it('renders the not_purchased message and no form when ineligible for that reason', async () => {
      const { fixture: fx } = await buildFixture({ isLoggedIn: true, eligibility: NOT_PURCHASED });

      const el: HTMLElement = fx.nativeElement;
      expect(el.querySelector('.pdp__review-form-card')).toBeNull();
      expect(el.textContent).toContain("Only customers who've received this product can review it");
    });

    it('renders the own_listing message and no form when ineligible for that reason', async () => {
      const { fixture: fx } = await buildFixture({ isLoggedIn: true, eligibility: OWN_LISTING });

      const el: HTMLElement = fx.nativeElement;
      expect(el.querySelector('.pdp__review-form-card')).toBeNull();
      expect(el.textContent).toContain("You can't review your own listing.");
    });

    it('renders the reviewer\'s existing review when already_reviewed and it is on the current page', async () => {
      const { fixture: fx } = await buildFixture({
        isLoggedIn: true,
        eligibility: ALREADY_REVIEWED_ON_PAGE,
      });

      const el: HTMLElement = fx.nativeElement;
      expect(el.querySelector('.pdp__review-form-card')).toBeNull();
      const existing = el.querySelector('.pdp__review-existing');
      expect(existing).toBeTruthy();
      expect(existing?.textContent).toContain('Amazing honey.');
    });

    it('falls back to a plain "already reviewed" message when the existing review is not on the current page', async () => {
      const { fixture: fx } = await buildFixture({
        isLoggedIn: true,
        eligibility: ALREADY_REVIEWED_OFF_PAGE,
      });

      const el: HTMLElement = fx.nativeElement;
      expect(el.querySelector('.pdp__review-existing')).toBeNull();
      expect(el.textContent).toContain("You've already reviewed this product.");
    });

    it('rejects rating 0 and 6 as invalid, and accepts 1 and 5', async () => {
      const { component: c } = await buildFixture({ isLoggedIn: true, eligibility: ELIGIBLE });

      c.setRating(0);
      expect(c.reviewForm.controls.rating.invalid).toBe(true);
      c.setRating(6);
      expect(c.reviewForm.controls.rating.invalid).toBe(true);
      c.setRating(1);
      expect(c.reviewForm.controls.rating.valid).toBe(true);
      c.setRating(5);
      expect(c.reviewForm.controls.rating.valid).toBe(true);
    });

    it('rejects a 9-character body and a 2001-character body, and accepts the boundary lengths', async () => {
      const { component: c } = await buildFixture({ isLoggedIn: true, eligibility: ELIGIBLE });

      c.reviewForm.controls.body.setValue('a'.repeat(9));
      expect(c.reviewForm.controls.body.invalid).toBe(true);
      c.reviewForm.controls.body.setValue('a'.repeat(2001));
      expect(c.reviewForm.controls.body.invalid).toBe(true);
      c.reviewForm.controls.body.setValue('a'.repeat(10));
      expect(c.reviewForm.controls.body.valid).toBe(true);
      c.reviewForm.controls.body.setValue('a'.repeat(2000));
      expect(c.reviewForm.controls.body.valid).toBe(true);
    });

    it('does not submit and marks the form touched when invalid', async () => {
      const { component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ELIGIBLE,
      });

      c.submitReview();

      expect(rs.submit).not.toHaveBeenCalled();
      expect(c.reviewForm.controls.rating.touched).toBe(true);
      expect(c.reviewForm.controls.body.touched).toBe(true);
    });

    it('on successful submit: posts the DTO, refreshes the list from the server (never a local splice), resets the form, and shows a confirmation', async () => {
      const { fixture: fx, component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ELIGIBLE,
      });
      rs.submit.mockReturnValue(of(NEW_REVIEW));
      rs.getReviews.mockClear();
      // The post-submit refetch flips eligibility to already_reviewed — the
      // confirmation must still render even though canReview is now false.
      rs.checkEligibility.mockReturnValueOnce(of(ALREADY_REVIEWED_ON_PAGE));

      c.setRating(5);
      c.reviewForm.controls.body.setValue('Solid product overall, would buy again for sure.');
      c.submitReview();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      expect(rs.submit).toHaveBeenCalledWith('p1', {
        rating: 5,
        body: 'Solid product overall, would buy again for sure.',
      });
      // Refetches the current page from the server rather than splicing the
      // new review into the existing array client-side.
      expect(rs.getReviews).toHaveBeenCalledWith('p1', { page: 1, limit: 10 });
      expect(c.reviewForm.controls.rating.value).toBe(0);
      expect(c.reviewForm.controls.body.value).toBe('');
      expect(c.submitting()).toBe(false);
      expect(c.eligibility()).toEqual(ALREADY_REVIEWED_ON_PAGE);

      const el: HTMLElement = fx.nativeElement;
      expect(el.textContent).toContain('Thanks — your review has been posted.');
    });

    it('surfaces a 409 (already reviewed) distinctly, not as a generic failure', async () => {
      const { fixture: fx, component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ELIGIBLE,
      });
      rs.submit.mockReturnValue(
        throwError(() => ({ status: 409, error: { message: "You've already reviewed this." } })),
      );

      c.setRating(4);
      c.reviewForm.controls.body.setValue('A perfectly adequate review of this item.');
      c.submitReview();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      expect(c.reviewSubmitError()).toEqual({
        kind: 'duplicate',
        message: "You've already reviewed this.",
      });
      expect(c.submitting()).toBe(false);
      expect(fx.nativeElement.textContent).toContain("You've already reviewed this.");
    });

    it('surfaces a 403 (not eligible) distinctly, not as a generic failure', async () => {
      const { fixture: fx, component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ELIGIBLE,
      });
      rs.submit.mockReturnValue(
        throwError(() => ({ status: 403, error: { message: 'Not eligible to review this.' } })),
      );

      c.setRating(3);
      c.reviewForm.controls.body.setValue('Another perfectly adequate review here.');
      c.submitReview();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      expect(c.reviewSubmitError()).toEqual({
        kind: 'ineligible',
        message: 'Not eligible to review this.',
      });
      expect(c.submitting()).toBe(false);
    });

    it('blocks a double-submit while a request is already pending', async () => {
      const pending$ = new Subject<ReviewDto>();
      const { component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ELIGIBLE,
      });
      rs.submit.mockReturnValue(pending$);

      c.setRating(5);
      c.reviewForm.controls.body.setValue('A sufficiently long review body here.');
      c.submitReview();
      expect(c.submitting()).toBe(true);

      c.submitReview();
      expect(rs.submit).toHaveBeenCalledTimes(1);

      pending$.next(NEW_REVIEW);
      pending$.complete();
      expect(c.submitting()).toBe(false);
    });
  });

  // ── Edit / delete own review (PR-6) ──────────────────────────────────────

  describe('edit/delete own review', () => {
    it('renders Edit and Delete controls only on the caller\'s own review, never on the general review list', async () => {
      const { fixture: fx } = await buildFixture({
        isLoggedIn: true,
        eligibility: ALREADY_REVIEWED_ON_PAGE,
      });

      const el: HTMLElement = fx.nativeElement;
      expect(el.querySelector('.pdp__review-existing-edit')).toBeTruthy();
      expect(el.querySelector('.pdp__review-existing-delete')).toBeTruthy();

      // The general `.pdp__review` list items (including r1, the author's own
      // review when it happens to render there too) must never carry controls.
      const listItems = el.querySelectorAll('.pdp__review');
      expect(listItems.length).toBeGreaterThan(0);
      listItems.forEach((item) => {
        expect(item.querySelector('.pdp__review-existing-edit')).toBeNull();
        expect(item.querySelector('.pdp__review-existing-delete')).toBeNull();
      });
    });

    it('does not render edit/delete controls when eligible to write a fresh review', async () => {
      const { fixture: fx } = await buildFixture({ isLoggedIn: true, eligibility: ELIGIBLE });

      const el: HTMLElement = fx.nativeElement;
      expect(el.querySelector('.pdp__review-existing-edit')).toBeNull();
      expect(el.querySelector('.pdp__review-existing-delete')).toBeNull();
    });

    it('Edit pre-fills the shared form with the existing rating/body, saves via reviewsService.update, then reloads reviews + eligibility', async () => {
      const { fixture: fx, component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ALREADY_REVIEWED_ON_PAGE,
      });
      rs.getReviews.mockClear();
      rs.checkEligibility.mockClear();
      rs.update.mockReturnValue(of(EDITED_REVIEW));

      const el: HTMLElement = fx.nativeElement;
      (el.querySelector('.pdp__review-existing-edit') as HTMLButtonElement).click();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      // Pre-filled from r1 (rating 5, "Amazing honey.\nWill buy again.").
      expect(c.reviewForm.controls.rating.value).toBe(5);
      expect(c.reviewForm.controls.body.value).toBe('Amazing honey.\nWill buy again.');
      expect(fx.nativeElement.querySelector('.pdp__review-form-title')?.textContent).toContain(
        'Edit Your Review',
      );

      c.setRating(3);
      c.reviewForm.controls.body.setValue('Updated opinion after using it for a month.');
      c.saveReviewEdit();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      expect(rs.update).toHaveBeenCalledWith('r1', {
        rating: 3,
        body: 'Updated opinion after using it for a month.',
      });
      // Never a local splice — refetch from the server, same as submitReview().
      expect(rs.getReviews).toHaveBeenCalledWith('p1', { page: 1, limit: 10 });
      expect(rs.checkEligibility).toHaveBeenCalledWith('p1');
      expect(c.isEditingReview()).toBe(false);
      expect(c.savingEdit()).toBe(false);
    });

    it('Cancel on the edit form discards changes and returns to the read-only view without saving', async () => {
      const { fixture: fx, component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ALREADY_REVIEWED_ON_PAGE,
      });

      c.startEditReview();
      fx.detectChanges();
      c.reviewForm.controls.body.setValue('Some half-typed edit that should never be saved.');

      c.cancelEditReview();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      expect(rs.update).not.toHaveBeenCalled();
      expect(c.isEditingReview()).toBe(false);
      const el: HTMLElement = fx.nativeElement;
      expect(el.querySelector('.pdp__review-existing')).toBeTruthy();
      expect(el.textContent).toContain('Amazing honey.');
    });

    it('Delete requires a confirm step before the DELETE call fires; confirming calls reviewsService.delete, then reloads reviews + eligibility', async () => {
      const { fixture: fx, component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ALREADY_REVIEWED_ON_PAGE,
      });
      rs.getReviews.mockClear();
      rs.checkEligibility.mockClear();
      // Post-delete: the caller is now free to write a fresh review.
      rs.checkEligibility.mockReturnValue(of(ELIGIBLE));

      const el: HTMLElement = fx.nativeElement;
      (el.querySelector('.pdp__review-existing-delete') as HTMLButtonElement).click();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      // Clicking Delete alone must not fire the API — only the confirm step's
      // own button does. This repo has no window.confirm(); the confirm UI
      // is inline.
      expect(rs.delete).not.toHaveBeenCalled();
      expect(fx.nativeElement.querySelector('.pdp__review-delete-confirm')).toBeTruthy();
      expect(fx.nativeElement.textContent).toContain('Are you sure you want to delete your review?');

      const confirmBtn = fx.nativeElement.querySelector(
        '.pdp__review-existing-delete--confirm',
      ) as HTMLButtonElement;
      confirmBtn.click();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      expect(rs.delete).toHaveBeenCalledWith('r1');
      // Never a local splice — refetch from the server, mirroring submitReview().
      expect(rs.getReviews).toHaveBeenCalledWith('p1', { page: 1, limit: 10 });
      expect(rs.checkEligibility).toHaveBeenCalledWith('p1');
      expect(c.deleting()).toBe(false);
      expect(c.isConfirmingDelete()).toBe(false);
    });

    it('Cancel on the delete confirm step returns to the read-only view without calling delete', async () => {
      const { fixture: fx, component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ALREADY_REVIEWED_ON_PAGE,
      });

      c.confirmDeleteReview();
      fx.detectChanges();
      c.cancelDeleteReview();
      fx.detectChanges();

      expect(rs.delete).not.toHaveBeenCalled();
      expect(fx.nativeElement.querySelector('.pdp__review-delete-confirm')).toBeNull();
    });

    it('surfaces a 404 on edit distinctly (review no longer available) and refreshes the list/eligibility rather than a generic failure', async () => {
      const { fixture: fx, component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ALREADY_REVIEWED_ON_PAGE,
      });
      rs.getReviews.mockClear();
      rs.checkEligibility.mockClear();
      rs.update.mockReturnValue(throwError(() => ({ status: 404 })));
      // The refetch triggered by the 404 must agree with the error: the review
      // is actually gone, so the server now reports it absent and the caller
      // eligible again — not the stale `already_reviewed` state from setup.
      rs.getReviews.mockReturnValueOnce(of(REVIEWS_PAGE_1_WITHOUT_R1));
      rs.checkEligibility.mockReturnValueOnce(of(ELIGIBLE));

      c.startEditReview();
      c.reviewForm.controls.body.setValue('An edit that will fail with a 404.');
      c.saveReviewEdit();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      expect(c.reviewMutationError()).toEqual({
        kind: 'not-found',
        message: 'This review is no longer available.',
      });
      expect(fx.nativeElement.textContent).toContain('This review is no longer available.');
      expect(rs.getReviews).toHaveBeenCalledWith('p1', { page: 1, limit: 10 });
      expect(rs.checkEligibility).toHaveBeenCalledWith('p1');
      expect(c.isEditingReview()).toBe(false);
    });

    it('surfaces a 404 on delete distinctly (review no longer available) and refreshes the list/eligibility rather than a generic failure', async () => {
      const { fixture: fx, component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ALREADY_REVIEWED_ON_PAGE,
      });
      rs.getReviews.mockClear();
      rs.checkEligibility.mockClear();
      rs.delete.mockReturnValue(throwError(() => ({ status: 404 })));
      // Same reasoning as the edit-404 test: the refetch must reflect the
      // review actually being gone, not the stale `already_reviewed` setup state.
      rs.getReviews.mockReturnValueOnce(of(REVIEWS_PAGE_1_WITHOUT_R1));
      rs.checkEligibility.mockReturnValueOnce(of(ELIGIBLE));

      c.confirmDeleteReview();
      c.deleteReview();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      expect(c.reviewMutationError()).toEqual({
        kind: 'not-found',
        message: 'This review is no longer available.',
      });
      expect(fx.nativeElement.textContent).toContain('This review is no longer available.');
      expect(rs.getReviews).toHaveBeenCalledWith('p1', { page: 1, limit: 10 });
      expect(rs.checkEligibility).toHaveBeenCalledWith('p1');
    });

    it('surfaces a generic message for a non-404 edit failure, distinct from the not-found case', async () => {
      const { fixture: fx, component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ALREADY_REVIEWED_ON_PAGE,
      });
      rs.update.mockReturnValue(throwError(() => ({ status: 500 })));

      c.startEditReview();
      c.reviewForm.controls.body.setValue('An edit that will fail with a 500.');
      c.saveReviewEdit();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      expect(c.reviewMutationError()).toEqual({
        kind: 'generic',
        message: 'Could not save your changes right now. Please try again.',
      });
    });

    it('never renders an "(edited)" marker or similar after a successful edit (v1 explicitly has none)', async () => {
      const { fixture: fx, component: c, reviewsStub: rs } = await buildFixture({
        isLoggedIn: true,
        eligibility: ALREADY_REVIEWED_ON_PAGE,
      });
      rs.update.mockReturnValue(of(EDITED_REVIEW));
      rs.getReviews.mockReturnValue(
        of({
          ...REVIEWS_PAGE_1,
          items: [EDITED_REVIEW, REVIEWS_PAGE_1.items[1]],
        } satisfies ProductReviewListDto),
      );

      c.startEditReview();
      c.reviewForm.controls.body.setValue('Updated opinion after using it for a month.');
      c.saveReviewEdit();
      fx.detectChanges();
      await fx.whenStable();
      fx.detectChanges();

      const el: HTMLElement = fx.nativeElement;
      expect(el.textContent).not.toContain('(edited)');
      expect(el.textContent).not.toContain('Edited');
      expect(el.querySelector('[data-edited]')).toBeNull();
    });
  });
});
