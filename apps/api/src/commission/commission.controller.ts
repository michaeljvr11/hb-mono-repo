import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserRole } from '@hb/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { CommissionRateService } from './commission-rate.service';
import { CreateCommissionRateDto } from './dto/create-commission-rate.dto';

@Controller('admin/commission-rates')
@Roles(UserRole.ADMIN)
export class CommissionController {
  constructor(private readonly commissionRateService: CommissionRateService) {}

  @Get()
  list() {
    return this.commissionRateService.list();
  }

  @Post()
  create(@Body() dto: CreateCommissionRateDto, @GetUser() requestingUser: User) {
    return this.commissionRateService.create(dto, requestingUser.id);
  }
}
