import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserRole } from '@hb/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { ShippingFeeService } from './shipping-fee.service';
import { CreateShippingFeeSetDto } from './dto/create-shipping-fee-set.dto';

@Controller('admin/shipping-fees')
@Roles(UserRole.ADMIN)
export class ShippingFeeController {
  constructor(private readonly shippingFeeService: ShippingFeeService) {}

  @Get()
  list() {
    return this.shippingFeeService.list();
  }

  @Post()
  create(@Body() dto: CreateShippingFeeSetDto, @GetUser() requestingUser: User) {
    return this.shippingFeeService.create(dto, requestingUser.id);
  }
}
