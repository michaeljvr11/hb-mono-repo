import { Controller, Get } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  getMyOrders(@GetUser() user: User) {
    return this.ordersService.findAllForUser(user.id);
  }
}
