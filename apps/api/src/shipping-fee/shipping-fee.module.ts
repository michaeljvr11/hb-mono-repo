import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShippingFee } from './entities/shipping-fee.entity';
import { ProductShippingFeeOverride } from './entities/product-shipping-fee-override.entity';
import { ShippingFeeService } from './shipping-fee.service';
import { ShippingFeeController } from './shipping-fee.controller';
import { CurrentShippingFeeController } from './current-shipping-fee.controller';
import { ProductShippingFeeOverrideService } from './product-shipping-fee-override.service';
import { ProductShippingFeeOverrideController } from './product-shipping-fee-override.controller';
import { CartOriginResolverService } from './cart-origin-resolver.service';
import { ShippingFeeResolverService } from './shipping-fee-resolver.service';
import { Product } from '../products/entities/product.entity';
import { Cart } from '../cart/entities/cart.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShippingFee, ProductShippingFeeOverride, Product, Cart])],
  providers: [
    ShippingFeeService,
    ProductShippingFeeOverrideService,
    CartOriginResolverService,
    ShippingFeeResolverService,
  ],
  controllers: [
    ShippingFeeController,
    CurrentShippingFeeController,
    ProductShippingFeeOverrideController,
  ],
  // Exported so SF-3's OrdersModule can import this module and call
  // ShippingFeeResolverService.resolveShippingCents directly (not @Global()).
  // ShippingFeeService/ProductShippingFeeOverrideService stay exported too —
  // ShippingFeeResolverService is the shared money-math wrapper around them,
  // not a replacement for their own direct consumers (e.g. the admin
  // shipping-fee/override controllers in this module).
  exports: [ShippingFeeService, ProductShippingFeeOverrideService, ShippingFeeResolverService],
})
export class ShippingFeeModule {}
