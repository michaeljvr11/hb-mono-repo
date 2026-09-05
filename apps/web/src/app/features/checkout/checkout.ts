import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AnalyticsEventType,
  CountryCode,
  CreateOrderRequest,
  CurrentShippingFeeDto,
  OrderDto,
} from '@hb/shared';
import { AuthService } from '../../core/auth/auth.service';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';
import { CartService } from '../../core/api/cart.service';
import { OrdersService } from '../../core/api/orders.service';
import { ShippingFeeService } from '../../core/api/shipping-fee.service';
import { formatPrice } from '../../shared/format-price';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StateMessage } from '../../shared/components/state-message/state-message';
import { TrustBanner } from '../../shared/components/trust-banner/trust-banner';

/** Preview-fetch state for the checkout shipping-fee line item (SF-4). */
export type ShippingFeeState = 'idle' | 'loading' | 'ready' | 'error';

type CheckoutState = 'loading' | 'ready' | 'submitting' | 'success' | 'empty' | 'error';

/** Distinct error kinds so the UI can respond specifically — never a blanket
 *  "something went wrong" for actionable failures. */
export type CheckoutErrorKind = 'verification' | 'stock' | 'validation' | 'generic';

export interface CheckoutError {
  kind: CheckoutErrorKind;
  message: string;
}

interface ApiErrorShape {
  status?: number;
  error?: { message?: string | string[] };
}

/** Prose country names for the shipping banner. The summary line item keeps the
 *  short codes (`shippingLabel`); the banner reads as a sentence. */
const COUNTRY_NAMES: Record<CountryCode, string> = {
  [CountryCode.SOUTH_AFRICA]: 'South Africa',
  [CountryCode.NAMIBIA]: 'Namibia',
};

/**
 * Checkout (design: docs/design/checkout/). Order summary amounts are display
 * of API-computed values only; the real totals are recomputed server-side on
 * submit — the request carries nothing but the shipping address.
 */
@Component({
  selector: 'app-checkout',
  imports: [
    NavBar,
    Footer,
    ReactiveFormsModule,
    RouterLink,
    Skeleton,
    StateMessage,
    TrustBanner,
  ],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss',
})
export class Checkout implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly cartService = inject(CartService);
  private readonly ordersService = inject(OrdersService);
  private readonly authService = inject(AuthService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly gaService = inject(GoogleAnalyticsService);
  private readonly shippingFeeService = inject(ShippingFeeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly CountryCode = CountryCode;

  readonly state = signal<CheckoutState>('loading');
  readonly checkoutError = signal<CheckoutError | null>(null);
  readonly placedOrder = signal<OrderDto | null>(null);
  readonly resendState = signal<'idle' | 'sending' | 'sent'>('idle');

  readonly cart = this.cartService.cart;
  readonly items = computed(() => this.cart()?.items ?? []);
  readonly totals = computed(() => this.cart()?.totals ?? []);
  /** ZAR and NAD are never summed — a mixed cart can't check out in one order. */
  readonly hasMixedCurrencies = computed(() => this.totals().length > 1);

  readonly form = this.fb.group({
    recipientName: ['', Validators.required],
    line1: ['', Validators.required],
    line2: [''],
    city: ['', Validators.required],
    region: [''],
    postalCode: [''],
    countryCode: this.fb.control<CountryCode>(CountryCode.NAMIBIA, Validators.required),
    phone: [''],
  });

  /** Live destination from the shipping form — drives the shipping-fee preview refetch. */
  private readonly destinationCountry = toSignal(this.form.controls.countryCode.valueChanges, {
    initialValue: this.form.controls.countryCode.value,
  });

  /** Bumped to force a refetch after a failed preview (see `retryShippingFee`). */
  private readonly shippingFeeRetryTrigger = signal(0);
  /** Guards against a slow, superseded request overwriting a newer one. */
  private shippingFeeRequestToken = 0;

  readonly shippingFeeState = signal<ShippingFeeState>('idle');
  readonly shippingFee = signal<CurrentShippingFeeDto | null>(null);

  /** subtotal + live shipping fee, in the cart's single currency. Never mixes
   *  currencies: null unless the fee we hold matches the cart's currency. */
  readonly grandTotal = computed(() => {
    const totals = this.totals();
    const fee = this.shippingFee();
    if (totals.length !== 1 || !fee || fee.currency !== totals[0].currency) {
      return null;
    }
    return totals[0].subtotal + fee.amount;
  });

  /** Honest, route-specific label — never asserts "ZA to NA" for a route that
   *  isn't the one actually resolved by the API. */
  readonly shippingLabel = computed(() => {
    const fee = this.shippingFee();
    if (!fee) return 'Shipping';
    return fee.originCountry === fee.destinationCountry
      ? `Shipping (${fee.originCountry} domestic)`
      : `Shipping (${fee.originCountry} to ${fee.destinationCountry})`;
  });

  /** Whether the resolved route actually crosses a border. `null` while no route
   *  is resolved (loading / error / mixed-currency cart) — the banner then
   *  asserts neither, rather than defaulting to "cross-border". */
  readonly isCrossBorder = computed(() => {
    const fee = this.shippingFee();
    if (!fee) return null;
    return fee.originCountry !== fee.destinationCountry;
  });

  /** Banner heading, keyed on the same resolved route the fee is charged on —
   *  never on the address form's country selection. */
  readonly shippingBannerTitle = computed(() => {
    const crossBorder = this.isCrossBorder();
    if (crossBorder === null) return 'Shipping';
    return crossBorder ? 'Cross-Border Shipping' : 'Domestic Shipping';
  });

  /** Banner body copy. The 3–5 day transit estimate is a cross-border claim and
   *  stays on the cross-border branch only — there is no sourced domestic SLA,
   *  and inventing one would just be the next route-lie. */
  readonly shippingBannerNote = computed(() => {
    const fee = this.shippingFee();
    if (!fee) {
      return 'Trans-Frontier Express: secured logistics across South Africa and Namibia.';
    }
    const origin = COUNTRY_NAMES[fee.originCountry];
    if (fee.originCountry === fee.destinationCountry) {
      return `Trans-Frontier Express: secured logistics within ${origin}.`;
    }
    return `Trans-Frontier Express: secured logistics from ${origin} to ${COUNTRY_NAMES[fee.destinationCountry]}. 3–5 days arrival.`;
  });

  /** Confirmation-panel logistics line, built from the placed order's own route
   *  so it reads as honestly as the banner: a domestic order is described as
   *  domestic, not as a "ZA to ZA" transfer between two countries. */
  readonly orderLogisticsNote = computed(() => {
    const order = this.placedOrder();
    if (!order) return null;
    const origin = COUNTRY_NAMES[order.originCountry];
    if (order.originCountry === order.destinationCountry) {
      return `Trans-Frontier Express: secured logistics within ${origin}.`;
    }
    return `Trans-Frontier Express: secured logistics from ${origin} to ${COUNTRY_NAMES[order.destinationCountry]}.`;
  });

  constructor() {
    // Refetches the shipping-fee preview whenever the cart's (single)
    // currency or the shipping destination changes. Mixed-currency / empty
    // carts never fetch — no fee, no total shown while blocked (AC).
    effect(() => {
      const totals = this.totals();
      const destinationCountry = this.destinationCountry();
      this.shippingFeeRetryTrigger(); // dependency only — forces a rerun on retry

      if (totals.length !== 1 || !destinationCountry) {
        this.shippingFee.set(null);
        this.shippingFeeState.set('idle');
        return;
      }

      const requestToken = ++this.shippingFeeRequestToken;
      this.shippingFeeState.set('loading');
      this.shippingFeeService
        .current({ destinationCountry, currency: totals[0].currency })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (fee) => {
            if (requestToken !== this.shippingFeeRequestToken) return; // superseded
            this.shippingFee.set(fee);
            this.shippingFeeState.set('ready');
          },
          error: () => {
            if (requestToken !== this.shippingFeeRequestToken) return; // superseded
            // Degrade explicitly — never fall back to a silent 0 that reads as free shipping.
            this.shippingFee.set(null);
            this.shippingFeeState.set('error');
          },
        });
    });
  }

  /**
   * The landed-cost duty line. Formatted in the cart's own currency rather than
   * hard-coded to "R0.00" — a NAD cart would be told its duties are in rand.
   */
  readonly dutyLabel = computed(() => {
    const totals = this.totals();
    return totals.length === 1 ? `${formatPrice(0, totals[0].currency)} (SACU)` : 'None (SACU)';
  });

  /** Retries a failed shipping-fee preview fetch. */
  retryShippingFee(): void {
    this.shippingFeeRetryTrigger.update((value) => value + 1);
  }

  ngOnInit(): void {
    this.loadCart();
  }

  /** Also the error state's "Try again" — nothing else re-triggers the load. */
  loadCart(): void {
    this.state.set('loading');
    this.cartService.load().subscribe({
      next: (cart) => {
        const ready = cart.items.length > 0;
        this.state.set(ready ? 'ready' : 'empty');
        if (ready) {
          this.analyticsService.track(AnalyticsEventType.CHECKOUT_STARTED);
          const [onlyTotal] = cart.totals.length === 1 ? cart.totals : [];
          this.gaService.beginCheckout(
            onlyTotal?.subtotal,
            onlyTotal?.currency,
            cart.items.map((item) => ({ productId: item.productId, name: item.productName })),
          );
        }
      },
      error: () => this.state.set('error'),
    });
  }

  submit(): void {
    if (this.state() === 'submitting' || this.hasMixedCurrencies()) {
      return;
    }
    // Never place an order while the fee is unknown. In 'loading' and 'error'
    // the summary shows no Total at all, but the server still charges the real
    // resolved fee — letting the button through here would take payment for a
    // number the customer was never shown.
    if (this.shippingFeeState() !== 'ready') {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.checkoutError.set({
        kind: 'validation',
        message: 'Please complete the required shipping fields.',
      });
      return;
    }

    this.checkoutError.set(null);
    this.state.set('submitting');
    this.analyticsService.track(AnalyticsEventType.SHIPPING_SUBMITTED);

    const value = this.form.getRawValue();
    const request: CreateOrderRequest = {
      shippingAddress: {
        recipientName: value.recipientName,
        line1: value.line1,
        line2: value.line2 || undefined,
        city: value.city,
        region: value.region || undefined,
        postalCode: value.postalCode || undefined,
        countryCode: value.countryCode,
        phone: value.phone || undefined,
      },
    };

    this.analyticsService.track(AnalyticsEventType.PAYMENT_ATTEMPTED);
    this.ordersService.create(request).subscribe({
      next: (order) => {
        this.placedOrder.set(order);
        this.state.set('success');
        this.analyticsService.track(AnalyticsEventType.ORDER_COMPLETED, {
          orderId: order.id,
          value: order.total,
          currency: order.currency,
        });
        this.gaService.purchase(order.id, order.total, order.currency);
        // The server cleared the cart as part of the order — drop local state
        // so the nav badge resets.
        this.cartService.reset();
      },
      error: (err: ApiErrorShape) => {
        const mapped = this.mapError(err);
        this.state.set('ready');
        this.checkoutError.set(mapped);
        this.analyticsService.track(AnalyticsEventType.PAYMENT_FAILED);
        if (mapped.kind === 'stock') {
          // Stock changed under us — refresh the summary to the live truth.
          this.cartService.load().subscribe({ error: () => undefined });
        }
      },
    });
  }

  resendVerification(): void {
    if (this.resendState() === 'sending') return;
    this.resendState.set('sending');
    this.authService.resendVerification().subscribe({
      next: () => this.resendState.set('sent'),
      error: () => this.resendState.set('idle'),
    });
  }

  format(amount: number, currency: string): string {
    return formatPrice(amount, currency);
  }

  private mapError(err: ApiErrorShape): CheckoutError {
    const raw = err?.error?.message;
    const message = Array.isArray(raw) ? raw.join(' ') : raw;

    if (err?.status === 403) {
      return {
        kind: 'verification',
        message: message ?? 'Verify your email before placing an order.',
      };
    }
    if (err?.status === 409) {
      return {
        kind: 'stock',
        message: message ?? 'Some items in your cart are no longer in stock.',
      };
    }
    if (err?.status === 400) {
      return {
        kind: 'validation',
        message: message ?? 'Please check your order details and try again.',
      };
    }
    return {
      kind: 'generic',
      message: 'Could not place your order right now. Please try again.',
    };
  }
}
