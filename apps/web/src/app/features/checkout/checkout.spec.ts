import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AnalyticsEventType,
  AuthUser,
  CartDto,
  CountryCode,
  CurrencyCode,
  OrderDto,
  OrderStatus,
} from '@hb/shared';

import { Checkout } from './checkout';
import { routes } from '../../app.routes';
import { authGuard } from '../../core/auth/auth-guard';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/api/cart.service';
import { OrdersService } from '../../core/api/orders.service';
import { AnalyticsService } from '../../core/api/analytics.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

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
      stockQuantity: 10,
      lineTotal: 370,
    },
  ],
  totals: [{ currency: CurrencyCode.ZAR, subtotal: 370 }],
  itemCount: 2,
  updatedAt: '2026-07-07T09:00:00.000Z',
};

const MIXED_CART: CartDto = {
  ...CART,
  totals: [
    { currency: CurrencyCode.ZAR, subtotal: 370 },
    { currency: CurrencyCode.NAD, subtotal: 50 },
  ],
};

const PLACED_ORDER: OrderDto = {
  id: 'a1b2c3d4-0000-0000-0000-000000000000',
  status: OrderStatus.CONFIRMED,
  currency: CurrencyCode.ZAR,
  subtotal: 370,
  shippingTotal: 0,
  total: 370,
  originCountry: CountryCode.SOUTH_AFRICA,
  destinationCountry: CountryCode.NAMIBIA,
  items: [],
  createdAt: '2026-07-07T09:00:00.000Z',
  updatedAt: '2026-07-07T09:00:00.000Z',
};

// ─── Stubs ───────────────────────────────────────────────────────────────────

interface CartStub {
  cart: ReturnType<typeof signal<CartDto | null>>;
  itemCount: ReturnType<typeof signal<number>>;
  load: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
}

function makeCartStub(cart: CartDto): CartStub {
  const cartSignal = signal<CartDto | null>(null);
  return {
    cart: cartSignal,
    itemCount: signal(0),
    load: vi.fn(() => {
      cartSignal.set(cart);
      return of(cart);
    }),
    reset: vi.fn(() => cartSignal.set(null)),
  };
}

function fillForm(component: Checkout): void {
  component.form.setValue({
    recipientName: 'Johannes Shipanga',
    line1: '12 Independence Ave',
    line2: '',
    city: 'Windhoek',
    region: 'Khomas',
    postalCode: '',
    countryCode: CountryCode.NAMIBIA,
    phone: '+264 81 000 0000',
  });
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Checkout', () => {
  let fixture: ComponentFixture<Checkout>;
  let component: Checkout;
  let cartStub: CartStub;
  let ordersStub: { create: ReturnType<typeof vi.fn> };
  let authStub: {
    isLoggedIn: ReturnType<typeof vi.fn>;
    currentUser$: BehaviorSubject<AuthUser | null>;
    resendVerification: ReturnType<typeof vi.fn>;
  };
  let analyticsStub: { track: ReturnType<typeof vi.fn> };

  async function setup(cart: CartDto = CART): Promise<void> {
    cartStub = makeCartStub(cart);
    ordersStub = { create: vi.fn(() => of(PLACED_ORDER)) };
    authStub = {
      isLoggedIn: vi.fn(() => true),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      resendVerification: vi.fn(() => of({ message: 'sent' })),
    };
    analyticsStub = { track: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: CartService, useValue: cartStub },
        { provide: OrdersService, useValue: ordersStub },
        { provide: AuthService, useValue: authStub },
        { provide: AnalyticsService, useValue: analyticsStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ── Guard wiring ───────────────────────────────────────────────────────────

  it('registers /checkout behind the authGuard (returnUrl flow reused, not forked)', () => {
    const checkoutRoute = routes.find((r) => r.path === 'checkout');
    expect(checkoutRoute).toBeTruthy();
    expect(checkoutRoute?.canActivate).toContain(authGuard);
  });

  it('registers /cart behind the authGuard too', () => {
    const cartRoute = routes.find((r) => r.path === 'cart');
    expect(cartRoute).toBeTruthy();
    expect(cartRoute?.canActivate).toContain(authGuard);
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the order summary from the server cart (display-only totals)', async () => {
    await setup();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Fynbos Honey');
    expect(el.textContent).toContain('Qty: 2');
    expect(el.textContent).toMatch(/R\s?370[.,]00/);
    expect(el.textContent).toContain('Subtotal (ZAR)');
  });

  it('shows the empty state when the cart has nothing to check out', async () => {
    await setup({ ...CART, items: [], totals: [], itemCount: 0 });

    expect(fixture.nativeElement.textContent).toContain('Nothing to check out');
  });

  it('fires CHECKOUT_STARTED once the cart loads with items', async () => {
    await setup();

    expect(analyticsStub.track).toHaveBeenCalledWith(AnalyticsEventType.CHECKOUT_STARTED);
  });

  it('does not fire CHECKOUT_STARTED when the cart is empty', async () => {
    await setup({ ...CART, items: [], totals: [], itemCount: 0 });

    expect(analyticsStub.track).not.toHaveBeenCalledWith(AnalyticsEventType.CHECKOUT_STARTED);
  });

  it('blocks submission for mixed-currency carts with a specific explanation', async () => {
    await setup(MIXED_CART);

    fillForm(component);
    component.submit();

    expect(ordersStub.create).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('mixes ZAR and NAD');
  });

  // ── Submit flow ────────────────────────────────────────────────────────────

  it('does not call the API when the form is invalid', async () => {
    await setup();

    component.submit();

    expect(ordersStub.create).not.toHaveBeenCalled();
    expect(component.checkoutError()?.kind).toBe('validation');
  });

  it('submits only the shipping address and shows the confirmation on success', async () => {
    await setup();
    fillForm(component);

    component.submit();
    fixture.detectChanges();

    expect(ordersStub.create).toHaveBeenCalledWith({
      shippingAddress: {
        recipientName: 'Johannes Shipanga',
        line1: '12 Independence Ave',
        line2: undefined,
        city: 'Windhoek',
        region: 'Khomas',
        postalCode: undefined,
        countryCode: CountryCode.NAMIBIA,
        phone: '+264 81 000 0000',
      },
    });

    const el: HTMLElement = fixture.nativeElement;
    expect(component.state()).toBe('success');
    expect(el.textContent).toContain('Order placed!');
    expect(el.textContent).toContain('confirmed');
    expect(el.textContent).toMatch(/R\s?370[.,]00/);
    // Local cart state dropped so the nav badge resets.
    expect(cartStub.reset).toHaveBeenCalled();
  });

  it('fires SHIPPING_SUBMITTED, PAYMENT_ATTEMPTED and ORDER_COMPLETED (with the order total + currency) on a successful submit', async () => {
    await setup();
    fillForm(component);
    analyticsStub.track.mockClear();

    component.submit();
    fixture.detectChanges();

    expect(analyticsStub.track).toHaveBeenCalledWith(AnalyticsEventType.SHIPPING_SUBMITTED);
    expect(analyticsStub.track).toHaveBeenCalledWith(AnalyticsEventType.PAYMENT_ATTEMPTED);
    expect(analyticsStub.track).toHaveBeenCalledWith(AnalyticsEventType.ORDER_COMPLETED, {
      orderId: PLACED_ORDER.id,
      value: PLACED_ORDER.total,
      currency: PLACED_ORDER.currency,
    });
  });

  // ── Error surfacing (distinct, never swallowed) ────────────────────────────

  it('surfaces the unverified-email 403 with a resend affordance', async () => {
    await setup();
    fillForm(component);
    ordersStub.create.mockReturnValue(
      throwError(() => ({
        status: 403,
        error: { message: 'Verify your email before placing an order' },
      })),
    );

    component.submit();
    fixture.detectChanges();

    expect(component.checkoutError()?.kind).toBe('verification');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Verify your email');

    const resend = el.querySelector('.checkout__alert-action') as HTMLButtonElement;
    expect(resend).toBeTruthy();
    resend.click();
    fixture.detectChanges();

    expect(authStub.resendVerification).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Verification email sent');
  });

  it('surfaces insufficient stock (409) specifically and refreshes the cart', async () => {
    await setup();
    fillForm(component);
    ordersStub.create.mockReturnValue(
      throwError(() => ({
        status: 409,
        error: { message: "Insufficient stock for 'Fynbos Honey' — only 1 left" },
      })),
    );

    const loadsBefore = cartStub.load.mock.calls.length;
    component.submit();
    fixture.detectChanges();

    expect(component.checkoutError()?.kind).toBe('stock');
    expect(fixture.nativeElement.textContent).toContain("Insufficient stock for 'Fynbos Honey'");
    // The summary is refreshed to the live stock truth after the conflict.
    expect(cartStub.load.mock.calls.length).toBe(loadsBefore + 1);
  });

  it('keeps stock and verification errors distinct from generic failures', async () => {
    await setup();
    fillForm(component);
    ordersStub.create.mockReturnValue(throwError(() => ({ status: 500 })));

    component.submit();
    fixture.detectChanges();

    expect(component.checkoutError()?.kind).toBe('generic');
    expect(fixture.nativeElement.textContent).toContain('Could not place your order');
    expect(analyticsStub.track).toHaveBeenCalledWith(AnalyticsEventType.PAYMENT_FAILED);
  });
});
