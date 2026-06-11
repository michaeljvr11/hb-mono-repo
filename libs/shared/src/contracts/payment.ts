import { CurrencyCode, PaymentStatus } from '../enums';

export interface PaymentDto {
  id: string;
  orderId: string;
  amount: number;
  currency: CurrencyCode;
  status: PaymentStatus;
  /** Provider key, e.g. 'stub' until a real provider is chosen. */
  provider: string;
  /** Provider-side reference once a real provider is integrated. */
  providerRef?: string;
  createdAt: string;
}
