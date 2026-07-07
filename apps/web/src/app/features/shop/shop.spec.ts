import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser, CategoryDto, CountryCode, ProductDto, VendorDto, VendorStatus } from '@hb/shared';

import { Shop, deriveCategoryCounts, CategoryWithCount } from './shop';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';

describe('Shop', () => {
  let component: Shop;
  let fixture: ComponentFixture<Shop>;
  let httpMock: HttpTestingController;
  let authStub: {
    isLoggedIn: ReturnType<typeof vi.fn>;
    currentUser$: BehaviorSubject<AuthUser | null>;
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
    httpMock.expectOne(`${environment.apiBaseUrl}/products`).flush(opts?.products ?? products);
    httpMock.expectOne(`${environment.apiBaseUrl}/categories`).flush(opts?.categories ?? categories);
    httpMock.expectOne(`${environment.apiBaseUrl}/vendors/directory`).flush(opts?.vendors ?? vendors);
  }

  beforeEach(async () => {
    authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
    };

    await TestBed.configureTestingModule({
      imports: [Shop],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
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
    httpMock.expectOne(`${environment.apiBaseUrl}/products`).error(new ProgressEvent('error'));
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

  it('navigates to /discover with vendorId when a vendor card is selected', () => {
    flushLoads();
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const vendorCard = fixture.nativeElement.querySelector('.vendor-card') as HTMLButtonElement;
    vendorCard.click();

    expect(navigate).toHaveBeenCalledWith(['/discover'], { queryParams: { vendorId: 'v1' } });
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

  it('authenticated add-to-cart POSTs to the cart API and confirms via snackbar', () => {
    flushLoads();
    fixture.detectChanges();
    authStub.isLoggedIn.mockReturnValue(true);
    const snackBar = fixture.debugElement.injector.get(MatSnackBar);
    const openSpy = vi.spyOn(snackBar, 'open');

    component.onAddToCart(products[0]);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart/items`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ productId: 'p1', quantity: 1 });
    req.flush({ id: 'cart-1', items: [], totals: [], itemCount: 1, updatedAt: '' });

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('Organic Dried Fruit Hamper'),
      'View cart',
      expect.anything(),
    );
  });

  it('surfaces the API error message when add-to-cart fails', () => {
    flushLoads();
    fixture.detectChanges();
    authStub.isLoggedIn.mockReturnValue(true);
    const snackBar = fixture.debugElement.injector.get(MatSnackBar);
    const openSpy = vi.spyOn(snackBar, 'open');

    component.onAddToCart(products[0]);

    httpMock
      .expectOne(`${environment.apiBaseUrl}/cart/items`)
      .flush({ message: "'Organic Dried Fruit Hamper' is out of stock" }, { status: 409, statusText: 'Conflict' });

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('out of stock'),
      'Close',
      expect.anything(),
    );
  });

  it('shows a coming-soon notice for orders/profile/wishlist radial nav items', () => {
    flushLoads();
    fixture.detectChanges();
    const snackBar = fixture.debugElement.injector.get(MatSnackBar);
    const openSpy = vi.spyOn(snackBar, 'open');

    component.onRadialNavSelect('orders');
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('My Orders'),
      expect.anything(),
      expect.anything(),
    );

    component.onRadialNavSelect('profile');
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('Profile'),
      expect.anything(),
      expect.anything(),
    );

    component.onRadialNavSelect('wishlist');
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('Wishlist'),
      expect.anything(),
      expect.anything(),
    );
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
