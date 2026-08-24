import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShippingFee } from './entities/shipping-fee.entity';
import { ShippingFeeService } from './shipping-fee.service';
import { ShippingFeeController } from './shipping-fee.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ShippingFee])],
  providers: [ShippingFeeService],
  controllers: [ShippingFeeController],
  // Exported so SF-3's OrdersModule can import this module and call
  // ShippingFeeService.getFeeAt directly (not @Global()).
  exports: [ShippingFeeService],
})
export class ShippingFeeModule {}
