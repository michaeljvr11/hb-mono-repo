import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CountryCode, CreateOrderRequest, OrderDto } from '@hb/shared';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/api/cart.service';
import { OrdersService } from '../../core/api/orders.service';
import { formatPrice } from '../../shared/format-price';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';

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

/**
 * Checkout (design: docs/design/checkout/). Order summary amounts are display
 * of API-computed values only; the real totals are recomputed server-side on
 * submit — the request carries nothing but the shipping address.
 */
@Component({
  selector: 'app-checkout',
  imports: [NavBar, Footer, ReactiveFormsModule, RouterLink],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss',
})
export class Checkout implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly cartService = inject(CartService);
  private readonly ordersService = inject(OrdersService);
  private readonly authService = inject(AuthService);

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

  ngOnInit(): void {
    this.cartService.load().subscribe({
      next: (cart) => this.state.set(cart.items.length ? 'ready' : 'empty'),
      error: () => this.state.set('error'),
    });
  }

  submit(): void {
    if (this.state() === 'submitting' || this.hasMixedCurrencies()) {
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

    this.ordersService.create(request).subscribe({
      next: (order) => {
        this.placedOrder.set(order);
        this.state.set('success');
        // The server cleared the cart as part of the order — drop local state
        // so the nav badge resets.
        this.cartService.reset();
      },
      error: (err: ApiErrorShape) => {
        const mapped = this.mapError(err);
        this.state.set('ready');
        this.checkoutError.set(mapped);
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
