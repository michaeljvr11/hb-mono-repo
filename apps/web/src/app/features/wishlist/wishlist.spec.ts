import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthUser, CurrencyCode, WishlistDto } from '@hb/shared';

import { signal } from '@angular/core';
import { Wishlist } from './wishlist';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/api/cart.service';
import { CategoryNavStore } from '../../layout/category-nav/category-nav.store';
import { environment } from '../../../environments/environment';

const WISHLIST: WishlistDto = {
  items: [
    {
      id: 'wi-1',
      productId: 'p1',
      productName: 'Fynbos Honey',
      price: 185,
      currency: CurrencyCode.ZAR,
      stockQuantity: 3,
      hasSizes: false,
      imageUrl: 'https://example.com/honey.jpg',
      addedAt: '2026-07-07T09:00:00.000Z',
    },
    {
      id: 'wi-2',
      productId: 'p2',
      productName: 'Namib Salt',
      price: 19.99,
      currency: CurrencyCode.NAD,
      stockQuantity: 0,
      hasSizes: false,
      addedAt: '2026-07-07T09:05:00.000Z',
    },
  ],
  itemCount: 2,
};

const EMPTY: WishlistDto = { items: [], itemCount: 0 };

describe('Wishlist page', () => {
  let fixture: ComponentFixture<Wishlist>;
  let component: Wishlist;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Wishlist],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            // false so the embedded NavBar does not also prime the cart —
            // this suite pins the page's own single GET /wishlist.
            isLoggedIn: vi.fn(() => false),
            currentUser$: new BehaviorSubject<AuthUser | null>(null),
          },
        },
        // Same reason: the header's category nav must not add a GET /categories
        // that `httpMock.verify()` would then report as unhandled.
        {
          provide: CategoryNavStore,
          useValue: { categories: signal([]), state: signal('idle'), load: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Wishlist);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // triggers ngOnInit → GET /wishlist
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushWishlist(wishlist: WishlistDto = WISHLIST): void {
    httpMock.expectOne(`${environment.apiBaseUrl}/wishlist`).flush(wishlist);
    fixture.detectChanges();
  }

  it('shows the loading hint before the wishlist resolves', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Loading your wishlist');

    flushWishlist();
  });

  it('renders items with live per-item prices, never conflating ZAR and NAD', () => {
    flushWishlist();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Fynbos Honey');
    expect(el.textContent).toContain('Namib Salt');
    expect(el.textContent).toMatch(/R\s?185[.,]00/); // ZAR item price
    expect(el.textContent).toMatch(/N\$\s?19[.,]99/); // NAD item price
  });

  it('shows the empty state with a browse CTA when the wishlist has no items', () => {
    flushWishlist(EMPTY);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Your wishlist is empty');
    expect(el.querySelector('a.wishlist__empty-cta')?.getAttribute('href')).toBe('/shop');
  });

  it('shows an error hint when the load fails', () => {
    httpMock.expectOne(`${environment.apiBaseUrl}/wishlist`).flush(
      { message: 'boom' },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Could not load your wishlist');
  });

  it('removes an item via DELETE and re-renders from the server response (no local splice)', () => {
    flushWishlist();

    component.remove(WISHLIST.items[0]);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/wishlist/items/p1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ items: [WISHLIST.items[1]], itemCount: 1 });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain('Fynbos Honey');
    expect(el.textContent).toContain('Namib Salt');
  });

  it('shows an out-of-stock badge and disables add-to-cart for a zero-stock item', () => {
    flushWishlist();

    const rows = fixture.nativeElement.querySelectorAll('.wishlist__item');
    const outOfStockRow = rows[1] as HTMLElement;
    expect(outOfStockRow.textContent).toContain('Out of stock');

    const addBtn = outOfStockRow.querySelector('.wishlist__add-btn') as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });

  it('adds an in-stock item to the cart via CartService', () => {
    flushWishlist();
    const cartService = TestBed.inject(CartService);
    const addItem = vi.spyOn(cartService, 'addItem');

    component.addToCart(WISHLIST.items[0]);

    expect(addItem).toHaveBeenCalledWith('p1');

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart/items`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'cart-1', items: [], totals: [], itemCount: 1, updatedAt: '' });
  });

  it('does not add an out-of-stock item to the cart', () => {
    flushWishlist();
    const cartService = TestBed.inject(CartService);
    const addItem = vi.spyOn(cartService, 'addItem');

    component.addToCart(WISHLIST.items[1]);

    expect(addItem).not.toHaveBeenCalled();
    httpMock.expectNone(`${environment.apiBaseUrl}/cart/items`);
  });

  // ── Sized wishlist items (Product Sizing FAIL 3) ────────────────────────────

  it('routes a sized item to the PDP instead of calling CartService.addItem', () => {
    flushWishlist({
      ...WISHLIST,
      items: [{ ...WISHLIST.items[0], hasSizes: true, stockQuantity: 0 }],
    });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const cartService = TestBed.inject(CartService);
    const addItem = vi.spyOn(cartService, 'addItem');

    component.addToCart({ ...WISHLIST.items[0], hasSizes: true, stockQuantity: 0 });

    expect(navigate).toHaveBeenCalledWith(['/products', 'p1']);
    expect(addItem).not.toHaveBeenCalled();
  });

  it('still adds an unsized item straight to cart (regression)', () => {
    flushWishlist();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    const cartService = TestBed.inject(CartService);
    const addItem = vi.spyOn(cartService, 'addItem');

    component.addToCart(WISHLIST.items[0]);

    expect(addItem).toHaveBeenCalledWith('p1');
    expect(navigate).not.toHaveBeenCalled();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart/items`);
    req.flush({ id: 'cart-1', items: [], totals: [], itemCount: 1, updatedAt: '' });
  });

  it('does not show a false out-of-stock state for a sized item with stockQuantity 0', () => {
    flushWishlist({
      ...WISHLIST,
      items: [{ ...WISHLIST.items[0], hasSizes: true, stockQuantity: 0 }],
    });

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).not.toContain('Out of stock');

    const addBtn = el.querySelector('.wishlist__add-btn') as HTMLButtonElement;
    expect(addBtn.disabled).toBe(false);
    expect(addBtn.textContent).toContain('Select Size');
  });
});
