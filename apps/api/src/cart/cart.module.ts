import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';

// Skeleton: entities registered, cart endpoints come with the checkout flow.
@Module({
  imports: [TypeOrmModule.forFeature([Cart, CartItem])],
})
export class CartModule {}
