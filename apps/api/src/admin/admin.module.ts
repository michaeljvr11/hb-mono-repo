import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { AnalyticsEvent } from '../analytics/entities/analytics-event.entity';
import { AdminService } from './admin.service';
import { AdminOrdersService } from './admin-orders.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Order, OrderItem, Vendor, AnalyticsEvent])],
  providers: [AdminService, AdminOrdersService, AdminAnalyticsService],
  controllers: [AdminController],
})
export class AdminModule {}
