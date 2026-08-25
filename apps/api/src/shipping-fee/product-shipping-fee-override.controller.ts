import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { UserRole } from '@hb/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { ProductShippingFeeOverrideService } from './product-shipping-fee-override.service';
import { SetProductShippingFeeOverrideDto } from './dto/set-product-shipping-fee-override.dto';
import { ClearProductShippingFeeOverrideDto } from './dto/clear-product-shipping-fee-override.dto';

@Controller('admin/products/:productId/shipping-fee-overrides')
@Roles(UserRole.ADMIN)
export class ProductShippingFeeOverrideController {
  constructor(private readonly overrideService: ProductShippingFeeOverrideService) {}

  @Get()
  list(@Param('productId', new ParseUUIDPipe()) productId: string) {
    return this.overrideService.listForProduct(productId);
  }

  @Put()
  set(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: SetProductShippingFeeOverrideDto,
    @GetUser() requestingUser: User,
  ) {
    return this.overrideService.set(productId, dto, requestingUser.id);
  }

  @Delete()
  clear(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Query() dto: ClearProductShippingFeeOverrideDto,
    @GetUser() requestingUser: User,
  ) {
    return this.overrideService.clear(productId, dto, requestingUser.id);
  }
}
