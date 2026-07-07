import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateCartItemRequest } from '@hb/shared';

export class UpdateCartItemDto implements UpdateCartItemRequest {
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Type(() => Number)
  quantity: number;
}
