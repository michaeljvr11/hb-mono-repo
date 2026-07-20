import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { CreateAddressDto, UpdateAddressDto } from './dto/create-address.dto';

/**
 * Authenticated (global JwtAuthGuard, no @Public/@Roles). Every role manages
 * its own address book — ownership is enforced in AddressesService, not here.
 */
@Controller('addresses')
export class AddressesController {
  constructor(private addressesService: AddressesService) {}

  @Get()
  getMyAddresses(@GetUser() user: User) {
    return this.addressesService.findAllForUser(user.id);
  }

  @Post()
  create(@GetUser() user: User, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(user.id, dto);
  }

  @Patch(':id')
  update(@GetUser() user: User, @Param('id') id: string, @Body() dto: UpdateAddressDto) {
    return this.addressesService.update(user, id, dto);
  }

  @Delete(':id')
  remove(@GetUser() user: User, @Param('id') id: string) {
    return this.addressesService.remove(user.id, id);
  }
}
