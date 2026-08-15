import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UserRole } from '@hb/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';

@Controller('admin/settings')
@Roles(UserRole.ADMIN)
export class PlatformSettingsController {
  constructor(private readonly platformSettingsService: PlatformSettingsService) {}

  @Get()
  get() {
    return this.platformSettingsService.get();
  }

  @Patch()
  update(@Body() dto: UpdatePlatformSettingsDto, @GetUser() requestingUser: User) {
    return this.platformSettingsService.update(dto, requestingUser.id);
  }
}
