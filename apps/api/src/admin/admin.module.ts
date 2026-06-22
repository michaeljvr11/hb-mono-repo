import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Vendor } from '../vendors/entities/vendor.entity';
import { AdminService } from './admin.service';
import { AdminOrdersService } from './admin-orders.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Order, OrderItem, Vendor])],
  providers: [AdminService, AdminOrdersService],
  controllers: [AdminController],
})
export class AdminModule {}
