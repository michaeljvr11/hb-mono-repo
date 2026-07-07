import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CartService } from './cart.service';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

/**
 * Authenticated-only (global JwtAuthGuard, no @Public). Every operation is
 * scoped to the caller's own cart in the service layer.
 */
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@GetUser() user: User) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  addItem(@GetUser() user: User, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch('items/:id')
  updateItem(@GetUser() user: User, @Param('id') itemId: string, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateItem(user.id, itemId, dto);
  }

  @Delete('items/:id')
  removeItem(@GetUser() user: User, @Param('id') itemId: string) {
    return this.cartService.removeItem(user.id, itemId);
  }
}
