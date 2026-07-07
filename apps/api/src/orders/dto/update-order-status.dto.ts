import { IsEnum } from 'class-validator';
import { OrderStatus, UpdateOrderStatusRequest } from '@hb/shared';

export class UpdateOrderStatusDto implements UpdateOrderStatusRequest {
  @IsEnum(OrderStatus, { message: 'Unknown order status' })
  status: OrderStatus;
}
