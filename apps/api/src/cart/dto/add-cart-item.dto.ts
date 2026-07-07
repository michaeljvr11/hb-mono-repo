import { IsInt, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AddCartItemRequest } from '@hb/shared';

export class AddCartItemDto implements AddCartItemRequest {
  @IsUUID('all', { message: 'productId must be a valid id' })
  productId: string;

  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  @Type(() => Number)
  quantity: number;
}
