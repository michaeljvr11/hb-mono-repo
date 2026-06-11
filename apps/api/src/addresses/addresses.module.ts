import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from './entities/address.entity';

// Skeleton: entity registered, CRUD endpoints come with the checkout flow.
@Module({
  imports: [TypeOrmModule.forFeature([Address])],
})
export class AddressesModule {}
