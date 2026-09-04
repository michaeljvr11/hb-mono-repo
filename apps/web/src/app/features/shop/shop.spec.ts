import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import {
  AnalyticsEventType,
  AuthUser,
  CategoryDto,
  CountryCode,
  ProductDto,
  VendorDto,
  VendorStatus,
} from '@hb/shared';

import { Shop, deriveCategoryCounts, CategoryWithCount } from './shop';
import { AuthService } from '../../core/auth/auth.service';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';
import { WishlistService } from '../../core/api/wishlist.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { environment } from '../../../environments/environment';

describe('Shop', () => {
  let component: Shop;
  let fixture: ComponentFixture<Shop>;
  let httpMock: HttpTestingController;
  let authStub: {
    isLoggedIn: ReturnType<typeof vi.fn>;
    currentUser$: BehaviorSubject<AuthUser | null>;
  };
  let analyticsStub: { track: ReturnType<typeof vi.fn> };
  let gaStub: { addToCart: ReturnType<typeof vi.fn> };
  let wishlistStub: {
    has: ReturnType<typeof vi.fn>;
    toggle: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    wishlist: ReturnType<typeof signal<null>>;
    itemCount: ReturnType<typeof signal<number>>;
  };

  const categories: CategoryDto[] = [
    { id: 'c1', name: 'Agriculture', displayOrder: 0 },
    { id: 'c2', name: 'Handicrafts', displayOrder: 1 },
  ];

  const products: ProductDto[] = [
    {
      id: 'p1',
      name: 'Organic Dried Fruit Hamper',
      description: 'Fresh dried fruit',
      price: '185.00',
      currency: 'NAD',
      stockQuantity: 10,
      images: [],
      categories: [{ id: 'c1', name: 'Agriculture', displayOrder: 0 }],
    } as unknown as ProductDto,
  ];

  const vendors: VendorDto[] = [
    {
      id: 'v1',
      businessName: 'Roots & Shoots Art',
      status: VendorStatus.APPROVED,
      countryCode: CountryCode.SOUTH_AFRICA,
    },
  ];

  function flushLoads(opts?: {
    products?: ProductDto[];
    categories?: CategoryDto[];
    vendors?: VendorDto[];
  }): void {
    const items = opts?.products ?? products;
    httpMock
      .expectOne((r) => r.url.startsWith(`${environment.apiBaseUrl}/products`))
      .flush({ items, total: items.length, page: 1, limit: 100 });
    httpMock.expectOne(`${environment.apiBaseUrl}/categories`).flush(opts?.categories ?? categories);
    httpMock.expectOne(`${environment.apiBaseUrl}/vendors/directory`).flush(opts?.vendors ?? vendors);
  }

  beforeEach(async () => {
    authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
    };
    analyticsStub = { track: vi.fn() };
    gaStub = { addToCart: vi.fn() };
    wishlistStub = {
      has: vi.fn().mockReturnValue(false),
      toggle: vi.fn(() => of({ items: [], itemCount: 0 })),
      load: vi.fn(() => of({ items: [], itemCount: 0 })),
      wishlist: signal(null),
      itemCount: signal(0),
    };

    await TestBed.configureTestingModule({
      imports: [Shop],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        { provide: AnalyticsService, useValue: analyticsStub },
        { provide: GoogleAnalyticsService, useValue: gaStub },
        { provide: WishlistService, useValue: wishlistStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Shop);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    flushLoads();
    expect(component).toBeTruthy();
  });

  it('passes the storefront placeholder to the mobile search bar', () => {
    flushLoads();
    fixture.detectChanges();
    const searchInput = fixture.nativeElement.querySelector('.search-bar__input') as HTMLInputElement;
    expect(searchInput.placeholder).toBe('Shop our latest products');
  });

  it('renders the "New in Namibia" section heading', () => {
    flushLoads();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('New in Namibia');
  });

  it('renders the "Explore Categories" section heading', () => {
    flushLoads();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Explore Categories');
  });

  it('renders the "Featured SME Vendors" section heading', () => {
    flushLoads();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Featured SME Vendors');
  });

  it('renders a product-card per loaded product in the carousel', () => {
    flushLoads();
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('app-product-card');
    expect(cards.length).toBe(products.length);
  });

  it('renders a category tile per loaded category with the derived product count', () => {
    flushLoads();
    fixture.detectChanges();
    const tiles = fixture.nativeElement.querySelectorAll('.category-card');
    expect(tiles.length).toBe(2);
    expect(tiles[0].textContent).toContain('Agriculture');
    expect(tiles[0].textContent).toContain('1 product');
  });

  it('shows the empty state when there are no products', () => {
    flushLoads({ products: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No products available yet');
  });

  it('shows the error state when the products request fails', () => {
    httpMock
      .expectOne((r) => r.url.startsWith(`${environment.apiBaseUrl}/products`))
      .error(new ProgressEvent('error'));
    httpMock.expectOne(`${environment.apiBaseUrl}/categories`).flush(categories);
    httpMock.expectOne(`${environment.apiBaseUrl}/vendors/directory`).flush(vendors);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Could not load products');
  });

  it('shows the empty state when there are no vendors', () => {
    flushLoads({ vendors: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No vendors available yet');
  });

  // ── Navigation handlers ────────────────────────────────────────────────

  it('navigates to /discover with categoryId when a category tile is clicked', () => {
    flushLoads();
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const tile = fixture.nativeElement.querySelector('.category-card') as HTMLButtonElement;
    tile.click();

    expect(navigate).toHaveBeenCalledWith(['/discover'], { queryParams: { categoryId: 'c1' } });
  });

  it('navigates to /vendors/:id when a vendor card is selected', () => {
    flushLoads();
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const vendorCard = fixture.nativeElement.querySelector('.vendor-card') as HTMLButtonElement;
    vendorCard.click();

    expect(navigate).toHaveBeenCalledWith(['/vendors', 'v1']);
  });

  it('does not navigate when onCategorySelect receives null', () => {
    flushLoads();
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onCategorySelect(null);

    expect(navigate).not.toHaveBeenCalled();
  });

  it('navigates to /discover with q on mobile search submit', () => {
    flushLoads();
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const searchInput = fixture.nativeElement.querySelector('.search-bar__input') as HTMLInputElement;
    searchInput.value = 'honey';
    searchInput.dispatchEvent(new Event('input'));
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/discover'], { queryParams: { q: 'honey' } });
  });

  it('does not navigate on an empty mobile search submit', () => {
    flushLoads();
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onMobileSearch('   ');

    expect(navigate).not.toHaveBeenCalled();
  });

  // ── Radial nav / cart gating ────────────────────────────────────────────

  it('routes to /login with returnUrl when the radial nav cart item is selected while anonymous', () => {
    flushLoads();
    fixture.detectChanges();
    authStub.isLoggedIn.mockReturnValue(false);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onRadialNavSelect('cart');

    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: router.url } });
  });

  it('navigates to /cart for the radial nav cart item when authenticated', () => {
    flushLoads();
    fixture.detectChanges();
    authStub.isLoggedIn.mockReturnValue(true);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onRadialNavSelect('cart');

    expect(navigate).toHaveBeenCalledWith(['/cart']);
  });

  // ── Add to cart ─────────────────────────────────────────────────────────

  it('routes anonymous add-to-cart to /login with the current returnUrl', () => {
    flushLoads();
    fixture.detectChanges();
    authStub.isLoggedIn.mockReturnValue(false);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onAddToCart(products[0]);

    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: router.url } });
  });

  it('authenticated add-to-cart POSTs to the cart API and confirms via a success notification', () => {
    flushLoads();
    fixture.detectChanges();
    authStub.isLoggedIn.mockReturnValue(true);
    const notificationService = TestBed.inject(NotificationService);
    const successSpy = vi.spyOn(notificationService, 'success');

    component.onAddToCart(products[0]);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart/items`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ productId: 'p1', quantity: 1 });
    req.flush({ id: 'cart-1', items: [], totals: [], itemCount: 1, updatedAt: '' });

    expect(successSpy).toHaveBeenCalledWith(
      expect.stringContaining('Organic Dried Fruit Hamper'),
      'View cart',
    );
    expect(analyticsStub.track).toHaveBeenCalledWith(AnalyticsEventType.ADD_TO_CART, {
      productId: 'p1',
      vendorId: undefined,
    });
    expect(gaStub.addToCart).toHaveBeenCalledWith(
      'p1',
      products[0].name,
      products[0].price,
      products[0].currency,
    );
  });

  it('surfaces the API error message when add-to-cart fails', () => {
    flushLoads();
    fixture.detectChanges();
    authStub.isLoggedIn.mockReturnValue(true);
    const notificationService = TestBed.inject(NotificationService);
    const errorSpy = vi.spyOn(notificationService, 'error');

    component.onAddToCart(products[0]);

    httpMock
      .expectOne(`${environment.apiBaseUrl}/cart/items`)
      .flush({ message: "'Organic Dried Fruit Hamper' is out of stock" }, { status: 409, statusText: 'Conflict' });

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('out of stock'));
  });

  // ── Wishlist toggle ─────────────────────────────────────────────────────

  it('routes anonymous wishlist toggle to /login with the current returnUrl and never calls the API', () => {
    flushLoads();
    fixture.detectChanges();
    authStub.isLoggedIn.mockReturnValue(false);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onWishlistToggle(products[0]);

    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: router.url } });
    expect(wishlistStub.toggle).not.toHaveBeenCalled();
  });

  it('authenticated wishlist toggle calls WishlistService.toggle with the product id', () => {
    flushLoads();
    fixture.detectChanges();
    authStub.isLoggedIn.mockReturnValue(true);

    component.onWishlistToggle(products[0]);

    expect(wishlistStub.toggle).toHaveBeenCalledWith('p1');
  });

  it('shows an empty heart before the first render — the hydration gate starts closed (SSR/first-paint parity)', () => {
    // WishlistService already reports membership, but the SSR-rendered
    // markup and the client's pre-hydration DOM must still agree on an
    // empty heart. `hydrated` only flips inside the `afterNextRender`
    // callback registered in the constructor, which requires an actual
    // render pass — so checking immediately after construction, before any
    // `detectChanges()`, is the one place this can't have fired yet. If the
    // gate were ever dropped (`isWishlisted` calling `has()` directly),
    // this would read `true` here and fail.
    wishlistStub.has.mockReturnValue(true);
    flushLoads(); // satisfy the outer fixture's pending loads from beforeEach

    const freshFixture = TestBed.createComponent(Shop);
    const freshComponent = freshFixture.componentInstance;

    expect(freshComponent.isWishlisted('p1')).toBe(false);

    freshFixture.detectChanges();
    flushLoads();
  });

  it('reflects real wishlist membership once hydrated', () => {
    wishlistStub.has.mockReturnValue(true);
    flushLoads();

    const freshFixture = TestBed.createComponent(Shop);
    const freshComponent = freshFixture.componentInstance;
    freshFixture.detectChanges();

    expect(freshComponent.isWishlisted('p1')).toBe(true);

    flushLoads();
  });

});

describe('deriveCategoryCounts', () => {
  const categories = [
    { id: 'c1', name: 'Agriculture', displayOrder: 0, productCount: 0 },
    { id: 'c2', name: 'Handicrafts', displayOrder: 1, productCount: 0 },
    { id: 'c3', name: 'Textiles', displayOrder: 2, productCount: 0 },
  ] as CategoryWithCount[];

  it('counts each category, including products that span multiple categories', () => {
    const products = [
      { id: 'p1', categories: [{ id: 'c1' }, { id: 'c2' }] },
      { id: 'p2', categories: [{ id: 'c1' }] },
    ] as unknown as ProductDto[];

    const result = deriveCategoryCounts(categories, products);

    expect(result.find((c) => c.id === 'c1')?.productCount).toBe(2);
    expect(result.find((c) => c.id === 'c2')?.productCount).toBe(1);
    // c3 has no products → 0, never undefined
    expect(result.find((c) => c.id === 'c3')?.productCount).toBe(0);
  });

  it('returns zero counts when there are no products', () => {
    const result = deriveCategoryCounts(categories, []);
    expect(result.every((c) => c.productCount === 0)).toBe(true);
  });
});
