import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { OrderStatus, OrderStatusOverrideRequest } from '@hb/shared';

/**
 * Body for PATCH /orders/:id/status-override — admin-only, bypasses
 * ORDER_STATUS_TRANSITIONS entirely (see OrdersService.overrideStatus).
 */
export class OrderStatusOverrideDto implements OrderStatusOverrideRequest {
  @IsEnum(OrderStatus, { message: 'Unknown order status' })
  status: OrderStatus;

  // Trimmed before validation so a whitespace-only reason is rejected by
  // @IsNotEmpty rather than persisted as a blank audit entry. Max length
  // mirrors the `order_status_overrides.reason` column (varchar(2000)).
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'A reason is required' })
  @MaxLength(2000, { message: 'Reason must be 2000 characters or fewer' })
  reason: string;

  @IsBoolean()
  sendNotifications: boolean;
}
