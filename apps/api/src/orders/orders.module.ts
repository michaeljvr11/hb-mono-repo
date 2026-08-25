import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderNotificationsListener } from './order-notifications.listener';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusOverride } from './entities/order-status-override.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { PaymentsModule } from '../payments/payments.module';
import { CommissionModule } from '../commission/commission.module';
import { ShippingFeeModule } from '../shipping-fee/shipping-fee.module';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { VendorsModule } from '../vendors/vendors.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderStatusOverride, Payment, Vendor]),
    // Payment goes through the PAYMENT_PROVIDER port (stub today, deliberate).
    PaymentsModule,
    // CommissionModule is NOT @Global() (VE-1 decision) — explicitly imported
    // here so OrdersService can snapshot the in-force rate onto order_items
    // at order-creation time.
    CommissionModule,
    // ShippingFeeModule is likewise NOT @Global() (SF-1/SF-5 decision) —
    // explicitly imported so OrdersService can resolve the global default
    // fee and per-product overrides at order-creation time (SF-3).
    ShippingFeeModule,
    // TE-4: OrderNotificationsListener's dependencies. No circular import —
    // VendorsModule does not import OrdersModule.
    MailModule,
    SettingsModule,
    VendorsModule,
  ],
  providers: [OrdersService, OrderNotificationsListener],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
