import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { buildTypeOrmOptions } from './config/typeorm.config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { VendorsModule } from './vendors/vendors.module';
import { AddressesModule } from './addresses/addresses.module';
import { CartModule } from './cart/cart.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ShippingModule } from './shipping/shipping.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { SearchModule } from './search/search.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CommissionModule } from './commission/commission.module';
import { EarningsModule } from './earnings/earnings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Search-index sync (card #47): in-process EventEmitter2 for product/vendor
    // write events, @nestjs/schedule for the daily full reindex cron. No
    // durable queue in v1 — see the "Product Search Engine" Obsidian spec.
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    // Global rate limiting (see docs/security H1). Default bucket is generous;
    // sensitive auth routes tighten it with @Throttle. In-memory store is fine for
    // a single instance — move to a shared store (e.g. Redis) when scaling out.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildTypeOrmOptions(config),
        autoLoadEntities: true,
      }),
    }),
    AuthModule,
    UsersModule,
    ProductsModule,
    CategoriesModule,
    VendorsModule,
    AddressesModule,
    CartModule,
    WishlistModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    AdminModule,
    AuditModule,
    SearchModule,
    AnalyticsModule,
    CommissionModule,
    EarningsModule,
  ],
  controllers: [AppController],
  providers: [
    // Rate limiting runs first so floods are shed before any auth work.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Global JWT enforcement; opt out per-route with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
