import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';

/**
 * Skeleton. The checkout flow will compose this with CartModule,
 * PaymentsModule (PAYMENT_PROVIDER port) and ShippingModule
 * (SHIPPING_PROVIDER port): price the cart, create the order + items,
 * take payment, then book the (possibly cross-border) shipment.
 */
@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private ordersRepository: Repository<Order>,
  ) {}

  async findAllForUser(userId: string): Promise<Order[]> {
    return this.ordersRepository.find({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }
}
