import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShippingFee } from './entities/shipping-fee.entity';
import { ProductShippingFeeOverride } from './entities/product-shipping-fee-override.entity';
import { ShippingFeeService } from './shipping-fee.service';
import { ShippingFeeController } from './shipping-fee.controller';
import { ProductShippingFeeOverrideService } from './product-shipping-fee-override.service';
import { ProductShippingFeeOverrideController } from './product-shipping-fee-override.controller';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShippingFee, ProductShippingFeeOverride, Product])],
  providers: [ShippingFeeService, ProductShippingFeeOverrideService],
  controllers: [ShippingFeeController, ProductShippingFeeOverrideController],
  // Exported so SF-3's OrdersModule can import this module and call
  // ShippingFeeService.getFeeAt / ProductShippingFeeOverrideService.findOverrideAmounts
  // directly (not @Global()).
  exports: [ShippingFeeService, ProductShippingFeeOverrideService],
})
export class ShippingFeeModule {}
