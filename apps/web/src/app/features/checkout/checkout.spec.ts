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
  CurrentShippingFeeDto,
  OrderDto,
  OrderStatus,
} from '@hb/shared';

import { Checkout } from './checkout';
import { routes } from '../../app.routes';
import { authGuard } from '../../core/auth/auth-guard';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/api/cart.service';
import { OrdersService } from '../../core/api/orders.service';
import { ShippingFeeService } from '../../core/api/shipping-fee.service';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';

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

const SHIPPING_FEE: CurrentShippingFeeDto = {
  amount: 50,
  currency: CurrencyCode.ZAR,
  originCountry: CountryCode.SOUTH_AFRICA,
  destinationCountry: CountryCode.NAMIBIA,
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
  let shippingFeeStub: { current: ReturnType<typeof vi.fn> };
  let authStub: {
    isLoggedIn: ReturnType<typeof vi.fn>;
    currentUser$: BehaviorSubject<AuthUser | null>;
    resendVerification: ReturnType<typeof vi.fn>;
  };
  let analyticsStub: { track: ReturnType<typeof vi.fn> };
  let gaStub: {
    beginCheckout: ReturnType<typeof vi.fn>;
    purchase: ReturnType<typeof vi.fn>;
  };

  async function setup(
    cart: CartDto = CART,
    currentFee: ReturnType<typeof vi.fn> = vi.fn(() => of(SHIPPING_FEE)),
  ): Promise<void> {
    cartStub = makeCartStub(cart);
    ordersStub = { create: vi.fn(() => of(PLACED_ORDER)) };
    shippingFeeStub = { current: currentFee };
    authStub = {
      isLoggedIn: vi.fn(() => true),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      resendVerification: vi.fn(() => of({ message: 'sent' })),
    };
    analyticsStub = { track: vi.fn() };
    gaStub = { beginCheckout: vi.fn(), purchase: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: CartService, useValue: cartStub },
        { provide: OrdersService, useValue: ordersStub },
        { provide: ShippingFeeService, useValue: shippingFeeStub },
        { provide: AuthService, useValue: authStub },
        { provide: AnalyticsService, useValue: analyticsStub },
        { provide: GoogleAnalyticsService, useValue: gaStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
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

  // ── Shipping fee preview (SF-4) ─────────────────────────────────────────────

  it('fetches the live shipping fee (destination + currency only) and renders it as its own line item', async () => {
    await setup();

    expect(shippingFeeStub.current).toHaveBeenCalledWith({
      destinationCountry: CountryCode.NAMIBIA,
      currency: CurrencyCode.ZAR,
    });

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Shipping (ZA to NA)');
    expect(el.textContent).toMatch(/R\s?50[.,]00/); // the fee itself, distinct from the subtotal
  });

  it('binds Total to subtotal + shipping fee, not subtotal alone', async () => {
    await setup();

    expect(component.grandTotal()).toBe(370 + 50);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toMatch(/R\s?420[.,]00/);
  });

  it('does not fetch or render a shipping fee for a mixed-currency cart', async () => {
    await setup(MIXED_CART);

    expect(shippingFeeStub.current).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('Shipping (');
  });

  it('refetches the fee when the shipping destination changes, and never shows a stale destination\'s fee', async () => {
    await setup();
    shippingFeeStub.current.mockClear();
    shippingFeeStub.current.mockReturnValue(
      of({
        amount: 90,
        currency: CurrencyCode.ZAR,
        originCountry: CountryCode.SOUTH_AFRICA,
        destinationCountry: CountryCode.SOUTH_AFRICA,
      } satisfies CurrentShippingFeeDto),
    );

    component.form.controls.countryCode.setValue(CountryCode.SOUTH_AFRICA);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(shippingFeeStub.current).toHaveBeenCalledWith({
      destinationCountry: CountryCode.SOUTH_AFRICA,
      currency: CurrencyCode.ZAR,
    });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Shipping (ZA domestic)');
    expect(el.textContent).not.toContain('Shipping (ZA to NA)');
  });

  it('degrades explicitly on a fee-fetch failure — no silent R0.00 total, with a retry affordance', async () => {
    await setup(CART, vi.fn(() => throwError(() => ({ status: 500 }))));

    const el: HTMLElement = fixture.nativeElement;
    expect(component.grandTotal()).toBeNull();
    expect(el.textContent).not.toMatch(/R\s?0[.,]00/);
    expect(el.textContent).toContain('Unavailable');
    const retry = el.querySelector('.checkout__summary-retry') as HTMLButtonElement;
    expect(retry).toBeTruthy();

    shippingFeeStub.current.mockReturnValue(of(SHIPPING_FEE));
    retry.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.grandTotal()).toBe(370 + 50);
  });

  it('fires CHECKOUT_STARTED once the cart loads with items', async () => {
    await setup();

    expect(analyticsStub.track).toHaveBeenCalledWith(AnalyticsEventType.CHECKOUT_STARTED);
  });

  it('does not fire CHECKOUT_STARTED when the cart is empty', async () => {
    await setup({ ...CART, items: [], totals: [], itemCount: 0 });

    expect(analyticsStub.track).not.toHaveBeenCalledWith(AnalyticsEventType.CHECKOUT_STARTED);
  });

  it('fires GA begin_checkout (value/currency/items) once the cart loads with items', async () => {
    await setup();

    expect(gaStub.beginCheckout).toHaveBeenCalledWith(370, CurrencyCode.ZAR, [
      { productId: 'p1', name: 'Fynbos Honey' },
    ]);
  });

  it('fires GA begin_checkout without value/currency for a mixed-currency cart', async () => {
    await setup(MIXED_CART);

    expect(gaStub.beginCheckout).toHaveBeenCalledWith(undefined, undefined, [
      { productId: 'p1', name: 'Fynbos Honey' },
    ]);
  });

  it('does not fire GA begin_checkout when the cart is empty', async () => {
    await setup({ ...CART, items: [], totals: [], itemCount: 0 });

    expect(gaStub.beginCheckout).not.toHaveBeenCalled();
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

  it('shows the same shippingTotal on the order confirmation as the previewed fee — never a value the API did not return', async () => {
    await setup(); // previewed fee = SHIPPING_FEE.amount (50)
    fillForm(component);

    const previewedFeeAmount = component.shippingFee()?.amount;
    expect(previewedFeeAmount).toBe(50);

    const chargedOrder: OrderDto = { ...PLACED_ORDER, shippingTotal: 50, total: 420 };
    ordersStub.create.mockReturnValue(of(chargedOrder));

    component.submit();
    fixture.detectChanges();

    // The confirmation reflects the API's OrderDto.shippingTotal, which here
    // matches what was previewed pre-order — the two must never drift.
    expect(previewedFeeAmount).toBe(chargedOrder.shippingTotal);
    expect(fixture.nativeElement.textContent).toMatch(/R\s?50[.,]00.*shipping/i);
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
    expect(gaStub.purchase).toHaveBeenCalledWith(
      PLACED_ORDER.id,
      PLACED_ORDER.total,
      PLACED_ORDER.currency,
    );
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
