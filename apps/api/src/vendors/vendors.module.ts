import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorAnalyticsService } from './vendor-analytics.service';
import { VendorEarningsReportService } from './vendor-earnings-report.service';
import { Vendor } from './entities/vendor.entity';
import { Product } from '../products/entities/product.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { AnalyticsEvent } from '../analytics/entities/analytics-event.entity';
import { UsersModule } from '../users/users.module';
import { FileUrlService } from '../products/upload/file-url.service';
import { EarningsModule } from '../earnings/earnings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vendor, Product, OrderItem, AnalyticsEvent]),
    UsersModule,
    EarningsModule,
  ],
  controllers: [VendorsController],
  providers: [VendorsService, VendorAnalyticsService, FileUrlService, VendorEarningsReportService],
  exports: [VendorsService],
})
export class VendorsModule {}
