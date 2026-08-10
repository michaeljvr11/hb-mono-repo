import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import type { AuthUser, CartDto, PagedResponse, UserDto } from '@hb/shared';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CountryCode,
  CurrencyCode,
  ListingType,
  ProductDto,
  VendorDto,
  VendorSectionType,
  VendorStatus,
} from '@hb/shared';

import { PublicVendorProfile } from './vendor-profile';
import { VendorsService } from '../../../core/api/vendors.service';
import { ProductsService } from '../../../core/api/products.service';
import { CartService } from '../../../core/api/cart.service';
import { WishlistService } from '../../../core/api/wishlist.service';
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

const SOAP: ProductDto = {
  id: 'p3',
  name: 'Goat Milk Soap Bar',
  description: 'desc',
  price: 45,
  currency: CurrencyCode.ZAR,
  stockQuantity: 30,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.VENDOR,
  images: [],
  vendor: { id: 'v1', businessName: 'Leko Organics' },
  // Distinct from HONEY/TEA's categories — used to exercise category-type sections.
  categories: [{ id: 'cat-3', name: 'Skincare' }],
  createdAt: '',
  updatedAt: '',
};

const VENDOR_WITH_BRANDING: VendorDto = {
  id: 'v3',
  businessName: 'Kalahari Crafts',
  status: VendorStatus.APPROVED,
  countryCode: CountryCode.NAMIBIA,
  bannerUrl: 'https://cdn.hb.test/banners/v3.jpg',
  logoUrl: 'https://cdn.hb.test/logos/v3.png',
  slogan: 'Handmade, always.',
};

const VENDOR_WITH_SECTIONS: VendorDto = {
  ...MOCK_VENDOR,
  profileSections: [
    {
      id: 'sec-1',
      title: 'Our Favourites',
      type: VendorSectionType.CURATED,
      productIds: ['p2', 'p1'],
    },
    {
      id: 'sec-2',
      title: 'Skincare',
      type: VendorSectionType.CATEGORY,
      categoryId: 'cat-3',
    },
  ],
};

const VENDOR_WITH_DANGLING_CURATED: VendorDto = {
  ...MOCK_VENDOR,
  profileSections: [
    {
      id: 'sec-1',
      title: 'Our Favourites',
      type: VendorSectionType.CURATED,
      productIds: ['missing-1', 'p2', 'missing-2', 'p1'],
    },
  ],
};

const VENDOR_WITH_ALL_EMPTY_SECTIONS: VendorDto = {
  ...MOCK_VENDOR,
  profileSections: [
    {
      id: 'sec-1',
      title: 'Ghost Curated',
      type: VendorSectionType.CURATED,
      productIds: ['missing-1', 'missing-2'],
    },
    {
      id: 'sec-2',
      title: 'Ghost Category',
      type: VendorSectionType.CATEGORY,
      categoryId: 'cat-none',
    },
  ],
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

interface WishlistStub {
  has: ReturnType<typeof vi.fn>;
  toggle: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  wishlist: ReturnType<typeof signal<null>>;
  itemCount: ReturnType<typeof signal<number>>;
}

function makeStubs(): {
  vendorsStub: VendorsStub;
  productsStub: ProductsStub;
  authStub: AuthStub;
  cartStub: CartStub;
  analyticsStub: AnalyticsStub;
  gaStub: GaStub;
  wishlistStub: WishlistStub;
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
    wishlistStub: {
      has: vi.fn(() => false),
      toggle: vi.fn(() => of({ items: [], itemCount: 0 })),
      load: vi.fn(() => of({ items: [], itemCount: 0 })),
      wishlist: signal(null),
      itemCount: signal(0),
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
  wishlistStub: WishlistStub,
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
  let wishlistStub: WishlistStub;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    ({ vendorsStub, productsStub, authStub, cartStub, analyticsStub, gaStub, wishlistStub } =
      makeStubs());
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'v1' }));

    await setupTestBed(
      vendorsStub,
      productsStub,
      authStub,
      cartStub,
      analyticsStub,
      gaStub,
      wishlistStub,
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

  // ── Wishlist toggle ──────────────────────────────────────────────────────

  it('anonymous onWishlistToggle routes to /login with the current returnUrl', () => {
    authStub.isLoggedIn.mockReturnValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onWishlistToggle(HONEY);

    expect(navigateSpy).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: router.url },
    });
    expect(wishlistStub.toggle).not.toHaveBeenCalled();
  });

  it('authenticated onWishlistToggle calls WishlistService.toggle with the product id', () => {
    authStub.isLoggedIn.mockReturnValue(true);

    component.onWishlistToggle(HONEY);

    expect(wishlistStub.toggle).toHaveBeenCalledWith('p1');
  });

  // ─── VPC-5: vendor branding + profile-section rendering ────────────────────
  describe('vendor branding + profile sections', () => {
    it('renders banner, logo, and slogan when set on the vendor', async () => {
      vendorsStub.getById.mockReturnValue(of(VENDOR_WITH_BRANDING));
      productsStub.list.mockReturnValue(of({ items: [], total: 0, page: 1, limit: 100 }));
      paramMap$.next(convertToParamMap({ id: 'v3' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const banner = el.querySelector<HTMLImageElement>('.vendor-profile__banner');
      const logo = el.querySelector<HTMLImageElement>('.vendor-profile__logo');
      const slogan = el.querySelector('.vendor-profile__slogan');

      expect(banner?.src).toBe(VENDOR_WITH_BRANDING.bannerUrl);
      expect(banner?.alt).toBe('Kalahari Crafts banner');
      expect(logo?.src).toBe(VENDOR_WITH_BRANDING.logoUrl);
      expect(logo?.alt).toBe('Kalahari Crafts logo');
      expect(slogan?.textContent).toContain('Handmade, always.');
    });

    it('omits banner, logo, and slogan markup when unset on the vendor', () => {
      // Default beforeEach loads MOCK_VENDOR, which has none of these fields.
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.vendor-profile__banner')).toBeNull();
      expect(el.querySelector('.vendor-profile__logo')).toBeNull();
      expect(el.querySelector('.vendor-profile__slogan')).toBeNull();
    });

    it('resolves a curated section in productIds order, not fetch order', async () => {
      vendorsStub.getById.mockReturnValue(of(VENDOR_WITH_SECTIONS));
      productsStub.list.mockReturnValue(
        of({ items: [HONEY, TEA, SOAP], total: 3, page: 1, limit: 100 }),
      );
      paramMap$.next(convertToParamMap({ id: 'v1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const curated = component.resolvedSections().find((s) => s.id === 'sec-1');
      expect(curated?.title).toBe('Our Favourites');
      // productIds is ['p2', 'p1'] — TEA before HONEY, the reverse of fetch order.
      expect(curated?.products.map((p) => p.id)).toEqual(['p2', 'p1']);
    });

    it('silently drops dangling productIds from a curated section, preserving the rest of the order', async () => {
      vendorsStub.getById.mockReturnValue(of(VENDOR_WITH_DANGLING_CURATED));
      productsStub.list.mockReturnValue(
        of({ items: [HONEY, TEA, SOAP], total: 3, page: 1, limit: 100 }),
      );
      paramMap$.next(convertToParamMap({ id: 'v1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const curated = component.resolvedSections().find((s) => s.id === 'sec-1');
      expect(curated?.products.map((p) => p.id)).toEqual(['p2', 'p1']);

      // SOAP (p3) isn't referenced by the only section, so it surfaces in the
      // residual "More from" grid rather than vanishing — total is 3, not 2.
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelectorAll('app-product-card').length).toBe(3);
    });

    it('renders a residual "More from <vendor>" grid for products not claimed by any section', async () => {
      vendorsStub.getById.mockReturnValue(of(VENDOR_WITH_DANGLING_CURATED));
      productsStub.list.mockReturnValue(
        of({ items: [HONEY, TEA, SOAP], total: 3, page: 1, limit: 100 }),
      );
      paramMap$.next(convertToParamMap({ id: 'v1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.unsectionedProducts().map((p) => p.id)).toEqual(['p3']);

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('More from Leko Organics');
    });

    it('omits the residual grid when every product is claimed by a section', async () => {
      vendorsStub.getById.mockReturnValue(of(VENDOR_WITH_SECTIONS));
      productsStub.list.mockReturnValue(
        of({ items: [HONEY, TEA, SOAP], total: 3, page: 1, limit: 100 }),
      );
      paramMap$.next(convertToParamMap({ id: 'v1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.unsectionedProducts()).toEqual([]);
      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).not.toContain('More from');
      // 2 (curated: p2, p1) + 1 (category: p3), no residual duplicate.
      expect(el.querySelectorAll('app-product-card').length).toBe(3);
    });

    it('a product claimed by any section is excluded from the residual grid even if another section also references it', async () => {
      const vendorWithOverlap: VendorDto = {
        ...MOCK_VENDOR,
        profileSections: [
          { id: 'sec-1', title: 'Top Picks', type: VendorSectionType.CURATED, productIds: ['p1'] },
          { id: 'sec-2', title: 'Agriculture', type: VendorSectionType.CATEGORY, categoryId: 'cat-1' },
        ],
      };
      vendorsStub.getById.mockReturnValue(of(vendorWithOverlap));
      productsStub.list.mockReturnValue(
        of({ items: [HONEY, TEA, SOAP], total: 3, page: 1, limit: 100 }),
      );
      paramMap$.next(convertToParamMap({ id: 'v1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      // HONEY (p1) is in both sec-1 and sec-2 (cat-1) — appears in both sections...
      const topPicks = component.resolvedSections().find((s) => s.id === 'sec-1');
      const agriculture = component.resolvedSections().find((s) => s.id === 'sec-2');
      expect(topPicks?.products.map((p) => p.id)).toEqual(['p1']);
      expect(agriculture?.products.map((p) => p.id)).toEqual(['p1', 'p2']);

      // ...but is still claimed, so only SOAP (p3, unrelated to either section) is residual.
      expect(component.unsectionedProducts().map((p) => p.id)).toEqual(['p3']);
    });

    it('resolves a category section to products whose categories include the matching category id', async () => {
      vendorsStub.getById.mockReturnValue(of(VENDOR_WITH_SECTIONS));
      productsStub.list.mockReturnValue(
        of({ items: [HONEY, TEA, SOAP], total: 3, page: 1, limit: 100 }),
      );
      paramMap$.next(convertToParamMap({ id: 'v1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const category = component.resolvedSections().find((s) => s.id === 'sec-2');
      expect(category?.title).toBe('Skincare');
      expect(category?.products.map((p) => p.id)).toEqual(['p3']);
    });

    it('drops sections that resolve to zero products entirely, falling back to category chips + grid', async () => {
      vendorsStub.getById.mockReturnValue(of(VENDOR_WITH_ALL_EMPTY_SECTIONS));
      productsStub.list.mockReturnValue(of({ items: [HONEY, TEA], total: 2, page: 1, limit: 100 }));
      paramMap$.next(convertToParamMap({ id: 'v1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.resolvedSections()).toEqual([]);
      expect(component.hasCustomSections()).toBe(false);

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).not.toContain('Ghost Curated');
      expect(el.textContent).not.toContain('Ghost Category');
      expect(el.querySelector('.vendor-profile__section-title')).toBeNull();
      expect(el.querySelector('.vendor-profile__section')).toBeNull();
      expect(el.querySelector('.vendor-profile__categories')).not.toBeNull();
      expect(el.querySelectorAll('app-product-card').length).toBe(2);
    });

    it('falls back to category chips + flat grid when profileSections is undefined', () => {
      // Default beforeEach loads MOCK_VENDOR, which has no profileSections field.
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.vendor-profile__section-title')).toBeNull();
      expect(el.querySelector('.vendor-profile__categories')).not.toBeNull();
      expect(el.querySelector('.vendor-profile__grid-section')).not.toBeNull();
      expect(el.querySelectorAll('app-product-card').length).toBe(2);
    });

    it('falls back to category chips + flat grid when profileSections is an explicit empty array', async () => {
      vendorsStub.getById.mockReturnValue(of({ ...MOCK_VENDOR, profileSections: [] }));
      paramMap$.next(convertToParamMap({ id: 'v1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.vendor-profile__section-title')).toBeNull();
      expect(el.querySelector('.vendor-profile__categories')).not.toBeNull();
      expect(el.querySelectorAll('app-product-card').length).toBe(2);
    });

    it('renders multiple resolved sections in the given profileSections array order', async () => {
      vendorsStub.getById.mockReturnValue(of(VENDOR_WITH_SECTIONS));
      productsStub.list.mockReturnValue(
        of({ items: [HONEY, TEA, SOAP], total: 3, page: 1, limit: 100 }),
      );
      paramMap$.next(convertToParamMap({ id: 'v1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const titles = Array.from(el.querySelectorAll('.vendor-profile__section-title')).map((n) =>
        n.textContent?.trim(),
      );
      expect(titles).toEqual(['Our Favourites', 'Skincare']);
    });

    it('renders no section markup while products are still loading, even if profileSections is set', async () => {
      const productsSubject = new Subject<PagedResponse<ProductDto>>();
      vendorsStub.getById.mockReturnValue(of(VENDOR_WITH_SECTIONS));
      productsStub.list.mockReturnValue(productsSubject.asObservable());
      paramMap$.next(convertToParamMap({ id: 'v1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.productsState()).toBe('loading');
      expect(component.resolvedSections()).toEqual([]);
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.vendor-profile__section-title')).toBeNull();

      productsSubject.next({ items: [HONEY, TEA, SOAP], total: 3, page: 1, limit: 100 });
      productsSubject.complete();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.hasCustomSections()).toBe(true);
    });
  });
});
