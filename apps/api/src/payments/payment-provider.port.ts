import { CurrencyCode } from '@hb/shared';

/**
 * Port for payment providers (hexagonal seam).
 * Choosing and integrating a real provider (Payfast, Paystack, …) is a future
 * decision — business code depends only on this interface and the
 * PAYMENT_PROVIDER token, so swapping the stub is a one-line module change.
 */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface InitiatePaymentRequest {
  orderId: string;
  amount: number;
  currency: CurrencyCode;
}

export interface PaymentIntentRef {
  provider: string;
  providerRef: string;
  /** Redirect/checkout URL when the provider uses a hosted page. */
  redirectUrl?: string;
}

export interface PaymentProviderPort {
  initiatePayment(request: InitiatePaymentRequest): Promise<PaymentIntentRef>;
  getPaymentStatus(providerRef: string): Promise<'pending' | 'paid' | 'failed'>;
  refund(providerRef: string, amount: number): Promise<void>;
}
