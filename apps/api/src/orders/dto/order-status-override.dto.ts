import { IsBoolean, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { OrderStatus, OrderStatusOverrideRequest } from '@hb/shared';

/**
 * Body for PATCH /orders/:id/status-override — admin-only, bypasses
 * ORDER_STATUS_TRANSITIONS entirely (see OrdersService.overrideStatus).
 */
export class OrderStatusOverrideDto implements OrderStatusOverrideRequest {
  @IsEnum(OrderStatus, { message: 'Unknown order status' })
  status: OrderStatus;

  @IsString()
  @IsNotEmpty({ message: 'A reason is required' })
  reason: string;

  @IsBoolean()
  sendNotifications: boolean;
}
