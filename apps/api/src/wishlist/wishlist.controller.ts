import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';

/**
 * Authenticated-only (global JwtAuthGuard, no @Public, no @Roles — any
 * signed-in role). Every operation is scoped to the caller's own wishlist
 * rows in the service layer.
 */
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  getWishlist(@GetUser() user: User) {
    return this.wishlistService.getWishlist(user.id);
  }

  @Post('items')
  addItem(@GetUser() user: User, @Body() dto: AddWishlistItemDto) {
    return this.wishlistService.addItem(user.id, dto);
  }

  @Delete('items/:productId')
  removeItem(@GetUser() user: User, @Param('productId') productId: string) {
    return this.wishlistService.removeItem(user.id, productId);
  }
}
