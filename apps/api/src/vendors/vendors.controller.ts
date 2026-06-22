import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { UserRole } from '@hb/shared';
import { VendorsService } from './vendors.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { AdminCreateVendorDto } from './dto/admin-create-vendor.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  // Admin only for now; public vendor directory later
  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.vendorsService.findAll();
  }

  // Admin can create vendors for any user (or none — pending onboarding)
  @Post('admin')
  @Roles(UserRole.ADMIN)
  adminCreate(@Body() dto: AdminCreateVendorDto) {
    return this.vendorsService.adminCreate(dto);
  }

  @Post()
  @Roles(UserRole.CUSTOMER, UserRole.VENDOR)
  create(@Body() createDto: CreateVendorDto, @GetUser() user: User) {
    return this.vendorsService.create(createDto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  updateStatus(@Param('id') id: string, @Body() body: UpdateVendorStatusDto) {
    return this.vendorsService.updateStatus(id, body.status);
  }

  @Public()
  @Get('directory')
  findDirectory() {
    return this.vendorsService.findDirectory();
  }

  @Get('me')
  @Roles(UserRole.VENDOR)
  getMyVendorProfile(@GetUser() user: User) {
    return this.vendorsService.findByUserId(user.id);
  }

  @Get('me/dashboard')
  @Roles(UserRole.VENDOR)
  getMyDashboard(@GetUser() user: User) {
    return this.vendorsService.getDashboard(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.VENDOR, UserRole.ADMIN)
  update(@Param('id') id: string, @Body() updateDto: UpdateVendorDto, @GetUser() user: User) {
    return this.vendorsService.update(id, updateDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.vendorsService.remove(id);
  }
}
