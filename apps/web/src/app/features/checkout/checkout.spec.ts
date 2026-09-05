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

/** A legitimately domestic route — `orders.originCountry` is derived from the
 *  cart's products, so ZA→ZA and NA→NA orders are representable. */
const DOMESTIC_FEE: CurrentShippingFeeDto = {
  amount: 30,
  currency: CurrencyCode.ZAR,
  originCountry: CountryCode.SOUTH_AFRICA,
  destinationCountry: CountryCode.SOUTH_AFRICA,
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

  it('renders the size label under the product name when present', async () => {
    await setup({
      ...CART,
      items: [{ ...CART.items[0], sizeLabel: 'Medium' }],
    });

    const el: HTMLElement = fixture.nativeElement;
    const sizeEls = el.querySelectorAll('.checkout__item-size');
    expect(sizeEls.length).toBe(1);
    expect(sizeEls[0].textContent).toContain('Medium');
  });

  it('omits the size label for unsized lines (no sizeLabel)', async () => {
    await setup(); // CART's line item has no sizeLabel

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.checkout__item-size').length).toBe(0);
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
    // Scoped to the priced rows: Phase 4 added an explicitly-labelled landed-cost
    // line that legitimately reads "R0.00 (SACU)". The bug this guards against is a
    // *silent* zero in the shipping or total line, so those are what it checks.
    const pricedRows = Array.from(
      el.querySelectorAll('.checkout__summary-row:not(.checkout__summary-row--muted)'),
    )
      .map((row) => row.textContent ?? '')
      .join(' ');
    expect(pricedRows).not.toMatch(/R\s?0[.,]00/);
    expect(el.textContent).toContain('Unavailable');
    const retry = el.querySelector('.checkout__summary-retry') as HTMLButtonElement;
    expect(retry).toBeTruthy();

    shippingFeeStub.current.mockReturnValue(of(SHIPPING_FEE));
    retry.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.grandTotal()).toBe(370 + 50);
  });

  // ── Route-honest shipping banner ────────────────────────────────────────────

  it('names the cross-border route in the banner, with the customs badge, when the route crosses a border', async () => {
    await setup();

    const el: HTMLElement = fixture.nativeElement;
    expect(component.isCrossBorder()).toBe(true);
    expect(el.textContent).toContain('Cross-Border Shipping');
    expect(el.textContent).toContain('secured logistics from South Africa to Namibia');
    expect(el.querySelector('.checkout__border-badge')).toBeTruthy();
  });

  it('calls a domestic route domestic and drops the customs badge, following the charged route not the address form', async () => {
    await setup(CART, vi.fn(() => of(DOMESTIC_FEE)));

    // The form still says Namibia — the banner must follow the ZA→ZA route the
    // fee was actually resolved on, never the address selection.
    expect(component.form.controls.countryCode.value).toBe(CountryCode.NAMIBIA);
    expect(component.isCrossBorder()).toBe(false);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Domestic Shipping');
    expect(el.textContent).toContain('secured logistics within South Africa');
    expect(el.textContent).not.toContain('Cross-Border Shipping');
    expect(el.textContent).not.toContain('South Africa to Namibia');
    expect(el.textContent).not.toContain('CUSTOMS PREPAID');
    expect(el.querySelector('.checkout__border-badge')).toBeNull();
  });

  it('flips the banner from cross-border to domestic when the resolved route changes', async () => {
    await setup();
    expect(fixture.nativeElement.textContent).toContain('Cross-Border Shipping');

    shippingFeeStub.current.mockReturnValue(of(DOMESTIC_FEE));
    component.form.controls.countryCode.setValue(CountryCode.SOUTH_AFRICA);
    fixture.detectChanges();
    await fixture.whenStable();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Domestic Shipping');
    expect(el.textContent).not.toContain('Cross-Border Shipping');
    expect(el.textContent).not.toContain('CUSTOMS PREPAID');
  });

  it('asserts no route in the banner while no route is resolved', async () => {
    await setup(CART, vi.fn(() => throwError(() => ({ status: 500 }))));

    const el: HTMLElement = fixture.nativeElement;
    expect(component.isCrossBorder()).toBeNull();
    expect(el.textContent).toContain('secured logistics across South Africa and Namibia');
    expect(el.textContent).not.toContain('Cross-Border Shipping');
    expect(el.textContent).not.toContain('Domestic Shipping');
    expect(el.textContent).not.toContain('CUSTOMS PREPAID');
  });

  it('asserts no route in the banner for a mixed-currency cart, which never resolves a fee', async () => {
    await setup(MIXED_CART);

    const el: HTMLElement = fixture.nativeElement;
    expect(component.isCrossBorder()).toBeNull();
    expect(el.textContent).not.toContain('Cross-Border Shipping');
    expect(el.textContent).not.toContain('CUSTOMS PREPAID');
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

  it('renders the API shippingTotal on the confirmation even when it differs from the previewed fee', async () => {
    await setup(); // previewed fee = SHIPPING_FEE.amount (50)
    fillForm(component);

    expect(component.shippingFee()?.amount).toBe(50);

    // Parity between the previewed and charged fee is enforced server-side:
    // GET /shipping-fee/current resolves over the caller's cart with the same
    // MAX(override ?? default) rule OrdersService.create charges, and an API
    // parity spec asserts the two agree. This spec covers the client's half of
    // the contract instead — if the API ever does return a different figure,
    // the confirmation must show the number actually charged, never echo the
    // stale preview back at the customer.
    const chargedOrder: OrderDto = { ...PLACED_ORDER, shippingTotal: 400, total: 770 };
    ordersStub.create.mockReturnValue(of(chargedOrder));

    component.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toMatch(/R\s?400[.,]00/);
    expect(fixture.nativeElement.textContent).not.toMatch(/R\s?50[.,]00.*shipping/i);
  });

  it('blocks placing an order while the shipping fee is unknown', async () => {
    await setup(
      CART,
      vi.fn(() => throwError(() => new Error('fee unavailable'))),
    );
    fillForm(component);

    expect(component.shippingFeeState()).toBe('error');

    component.submit();

    // No order may be placed against a total the customer was never shown.
    expect(ordersStub.create).not.toHaveBeenCalled();
  });

  it('describes the confirmed order by its own route, in prose rather than raw codes', async () => {
    await setup();
    fillForm(component);

    component.submit();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('secured logistics from South Africa to Namibia');
    expect(el.textContent).not.toContain('from ZA to NA');
  });

  it('describes a domestic order as domestic on the confirmation, never as a ZA-to-ZA transfer', async () => {
    await setup();
    fillForm(component);
    ordersStub.create.mockReturnValue(
      of({
        ...PLACED_ORDER,
        originCountry: CountryCode.SOUTH_AFRICA,
        destinationCountry: CountryCode.SOUTH_AFRICA,
      } satisfies OrderDto),
    );

    component.submit();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('secured logistics within South Africa');
    expect(el.textContent).not.toContain('from ZA to ZA');
    expect(el.textContent).not.toContain('South Africa to South Africa');
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

  // ── Trust, security and landed cost (Phase 4) ──────────────────────────

  it('states the landed-cost lines explicitly, in the cart currency', async () => {
    await setup();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Customs duties');
    expect(component.dutyLabel()).toMatch(/^R\s?0[.,]00 \(SACU\)$/);
    expect(el.textContent).toContain('Currency conversion');
    expect(el.textContent).toContain('None (ZAR/NAD 1:1)');
  });

  it('renders the payment-security block beside the payment method', async () => {
    await setup();

    const security = fixture.nativeElement.querySelector('.checkout__security') as HTMLElement;
    expect(security).toBeTruthy();
    expect(security.textContent).toContain('Your payment is secure');
    expect(security.textContent).toContain('never sees or stores your card details');
    expect(security.querySelector('app-trust-banner .trust-banner--inline')).toBeTruthy();
  });

  it('offers a retry and a way back rather than a dead end when the cart fails to load', async () => {
    await setup();
    cartStub.load.mockReturnValue(throwError(() => new Error('boom')));
    component.loadCart();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Could not load your cart right now.');
    const actions = el.querySelectorAll('app-state-message .state-message__action > *');
    expect(Array.from(actions).map((a) => a.textContent?.trim())).toEqual(['Try again', 'Back to cart']);
  });
});
