import { Controller, Get } from '@nestjs/common';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getProfile(@GetUser() user: User) {
    return this.usersService.getProfile(user.id);
  }
}
