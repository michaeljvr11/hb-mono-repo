import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shipment } from './entities/shipment.entity';
import { SHIPPING_PROVIDER } from './shipping-provider.port';
import { StubShippingProvider } from './providers/stub-shipping.provider';

/**
 * Swap StubShippingProvider for a real courier adapter here when one is
 * chosen; consumers inject SHIPPING_PROVIDER and never see the change.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Shipment])],
  providers: [{ provide: SHIPPING_PROVIDER, useClass: StubShippingProvider }],
  exports: [SHIPPING_PROVIDER],
})
export class ShippingModule {}
