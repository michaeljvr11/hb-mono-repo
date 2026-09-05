import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthUser, CartDto, CurrencyCode } from '@hb/shared';

import { signal } from '@angular/core';
import { Cart } from './cart';
import { AuthService } from '../../core/auth/auth.service';
import { CategoryNavStore } from '../../layout/category-nav/category-nav.store';
import { environment } from '../../../environments/environment';

const CART: CartDto = {
  id: 'cart-1',
  items: [
    {
      id: 'item-1',
      productId: 'p1',
      quantity: 2,
      productName: 'Fynbos Honey',
      unitPrice: 185,
      currency: CurrencyCode.ZAR,
      stockQuantity: 3,
      lineTotal: 370,
    },
    {
      id: 'item-2',
      productId: 'p2',
      quantity: 1,
      productName: 'Namib Salt',
      unitPrice: 19.99,
      currency: CurrencyCode.NAD,
      stockQuantity: 5,
      lineTotal: 19.99,
    },
  ],
  totals: [
    { currency: CurrencyCode.ZAR, subtotal: 370 },
    { currency: CurrencyCode.NAD, subtotal: 19.99 },
  ],
  itemCount: 3,
  updatedAt: '2026-07-07T09:00:00.000Z',
};

const EMPTY: CartDto = { id: 'cart-1', items: [], totals: [], itemCount: 0, updatedAt: '' };

describe('Cart page', () => {
  let fixture: ComponentFixture<Cart>;
  let component: Cart;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Cart],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            // false so the embedded NavBar does not also prime the cart —
            // this suite pins the page's own single GET /cart.
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

    fixture = TestBed.createComponent(Cart);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // triggers ngOnInit → GET /cart
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushCart(cart: CartDto = CART): void {
    httpMock.expectOne(`${environment.apiBaseUrl}/cart`).flush(cart);
    fixture.detectChanges();
  }

  it('renders line items with API-computed line totals and per-currency subtotals', () => {
    flushCart();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Fynbos Honey');
    expect(el.textContent).toContain('Namib Salt');
    expect(el.textContent).toMatch(/R\s?370[.,]00/); // ZAR line total
    expect(el.textContent).toMatch(/N\$\s?19[.,]99/); // NAD line total
    expect(el.textContent).toContain('Subtotal (ZAR)');
    expect(el.textContent).toContain('Subtotal (NAD)');
  });

  it('shows the empty state with a browse CTA when the cart has no items', () => {
    flushCart(EMPTY);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Your cart is empty');
    expect(el.querySelector('a.cart__empty-cta')?.getAttribute('href')).toBe('/discover');
  });

  it('increments quantity via PATCH', () => {
    flushCart();

    component.increment(CART.items[1]); // qty 1, stock 5

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart/items/item-2`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ quantity: 2 });
    req.flush(CART);
  });

  it('does not PATCH past the available stock (stepper clamped)', () => {
    flushCart({
      ...CART,
      items: [{ ...CART.items[0], quantity: 3, stockQuantity: 3 }],
    });

    component.increment({ ...CART.items[0], quantity: 3, stockQuantity: 3 });

    httpMock.expectNone(`${environment.apiBaseUrl}/cart/items/item-1`);
  });

  it('does not PATCH below quantity 1', () => {
    flushCart();

    component.decrement(CART.items[1]); // qty 1

    httpMock.expectNone(`${environment.apiBaseUrl}/cart/items/item-2`);
  });

  it('removes a line via DELETE', () => {
    flushCart();

    component.remove(CART.items[0]);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart/items/item-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(EMPTY);
  });

  it('disables the increase button at the stock limit', () => {
    flushCart({
      ...CART,
      items: [{ ...CART.items[0], quantity: 3, stockQuantity: 3 }],
      totals: [CART.totals[0]],
    });

    const buttons = fixture.nativeElement.querySelectorAll('.cart__stepper-btn');
    const increase = buttons[1] as HTMLButtonElement;
    expect(increase.disabled).toBe(true);
  });

  it('renders the size label under the product name when present', () => {
    flushCart({
      ...CART,
      items: [{ ...CART.items[0], sizeLabel: 'Medium' }, CART.items[1]],
    });

    const el: HTMLElement = fixture.nativeElement;
    const sizeEls = el.querySelectorAll('.cart__item-size');
    expect(sizeEls.length).toBe(1);
    expect(sizeEls[0].textContent).toContain('Medium');
  });

  it('omits the size label for unsized lines (no sizeLabel)', () => {
    flushCart(); // neither seeded item has sizeLabel

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.cart__item-size').length).toBe(0);
  });

  it('navigates to /checkout from the summary CTA', () => {
    flushCart();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('.cart__checkout-btn') as HTMLButtonElement).click();

    expect(navigate).toHaveBeenCalledWith(['/checkout']);
  });

  // ── Landed cost + trust (Phase 4) ──────────────────────────────────────

  it('states the customs-duty line explicitly, in the cart currency', () => {
    flushCart({ ...CART, items: [CART.items[0]], totals: [{ currency: CurrencyCode.NAD, subtotal: 370 }] });

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Customs duties');
    // Formatted from the cart's own currency, not hard-coded to rand.
    expect(component.dutyLabel()).toMatch(/^N\$\s?0[.,]00 \(SACU\)$/);
    expect(el.textContent).toContain('Calculated at checkout');
  });

  it('falls back to a wordy duty line when the cart mixes currencies', () => {
    flushCart(); // CART has both ZAR and NAD totals
    expect(component.dutyLabel()).toBe('None (SACU)');
  });

  it('shows the trust ribbon above the checkout CTA', () => {
    flushCart();

    const ribbon = fixture.nativeElement.querySelector('.cart__summary app-trust-banner');
    expect(ribbon).toBeTruthy();
    expect(ribbon.querySelector('.trust-banner--inline')).toBeTruthy();
  });

  it('offers a retry rather than a dead end when the cart fails to load', () => {
    httpMock.expectOne(`${environment.apiBaseUrl}/cart`).error(new ProgressEvent('error'));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Could not load your cart right now.');
    const retry = el.querySelector('app-state-message .state-message__btn') as HTMLButtonElement;
    expect(retry.textContent?.trim()).toBe('Try again');

    retry.click();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/cart`).flush(CART);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Fynbos Honey');
  });

  it('shows skeleton rows, not a bare line of text, while the cart loads', () => {
    expect(fixture.nativeElement.querySelectorAll('.cart__items--skeleton app-skeleton').length)
      .toBeGreaterThan(0);
    flushCart();
    expect(fixture.nativeElement.querySelectorAll('.cart__items--skeleton').length).toBe(0);
  });
});
