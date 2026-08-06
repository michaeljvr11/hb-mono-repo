import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Payment } from '../payments/entities/payment.entity';
import { VendorEarningsService } from './vendor-earnings.service';

/**
 * Payout-eligibility data model + net earnings computation (VE-3). No HTTP
 * surface here by design — VE-4 (admin cross-vendor earnings) and VE-5
 * (vendor own-earnings) build their controllers/DTOs on top of
 * `VendorEarningsService`. Mirrors `CommissionModule`'s shape: standalone,
 * not `@Global()` — explicitly `imports: [EarningsModule]` wherever
 * `VendorEarningsService` is needed.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Payment])],
  providers: [VendorEarningsService],
  exports: [VendorEarningsService],
})
export class EarningsModule {}
