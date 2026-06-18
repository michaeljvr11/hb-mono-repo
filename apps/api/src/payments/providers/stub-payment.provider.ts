import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  InitiatePaymentRequest,
  PaymentIntentRef,
  PaymentProviderPort,
} from '../payment-provider.port';

/**
 * No-op provider so the checkout flow can be built and tested end-to-end
 * before a real payment provider is chosen.
 */
@Injectable()
export class StubPaymentProvider implements PaymentProviderPort {
  private readonly logger = new Logger(StubPaymentProvider.name);

  initiatePayment(request: InitiatePaymentRequest): Promise<PaymentIntentRef> {
    this.logger.warn(
      `STUB payment initiated for order ${request.orderId}: ${request.amount} ${request.currency}`,
    );
    return Promise.resolve({
      provider: 'stub',
      providerRef: `stub_${randomUUID()}`,
    });
  }

  getPaymentStatus(): Promise<'pending' | 'paid' | 'failed'> {
    return Promise.resolve('paid'); // stub always succeeds
  }

  refund(providerRef: string, amount: number): Promise<void> {
    this.logger.warn(`STUB refund of ${amount} against ${providerRef}`);
    return Promise.resolve();
  }
}
