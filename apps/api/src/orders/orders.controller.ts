import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

/**
 * Authenticated (global JwtAuthGuard, no @Public). Thin by design: ownership,
 * verification gating and every state transition live in OrdersService.
 */
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  getMyOrders(@GetUser() user: User) {
    return this.ordersService.findAllForUser(user.id);
  }

  // Declared before ':id' — a literal segment must precede a param route or
  // Nest will treat 'vendor' as an :id value.
  @Get('vendor')
  getVendorOrders(@GetUser() user: User) {
    return this.ordersService.findAllForVendor(user.id);
  }

  @Get(':id')
  getOrder(@GetUser() user: User, @Param('id') id: string) {
    return this.ordersService.findOneForUser(user, id);
  }

  @Post()
  create(@GetUser() user: User, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user, dto);
  }

  @Patch(':id/status')
  updateStatus(@GetUser() user: User, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(user, id, dto.status);
  }
}
