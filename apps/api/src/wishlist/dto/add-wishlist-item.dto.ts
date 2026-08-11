import { IsUUID } from 'class-validator';
import { AddWishlistItemRequest } from '@hb/shared';

export class AddWishlistItemDto implements AddWishlistItemRequest {
  @IsUUID('all', { message: 'productId must be a valid id' })
  productId: string;
}
