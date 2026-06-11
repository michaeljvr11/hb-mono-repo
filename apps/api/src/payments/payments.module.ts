import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PAYMENT_PROVIDER } from './payment-provider.port';
import { StubPaymentProvider } from './providers/stub-payment.provider';

/**
 * Swap StubPaymentProvider for a real adapter here when the provider is
 * chosen; consumers inject PAYMENT_PROVIDER and never see the change.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  providers: [{ provide: PAYMENT_PROVIDER, useClass: StubPaymentProvider }],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
