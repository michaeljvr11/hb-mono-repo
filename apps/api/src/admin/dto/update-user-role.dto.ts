import { IsEnum } from 'class-validator';
import { UpdateUserRoleRequest, UserRole } from '@hb/shared';

export class UpdateUserRoleDto implements UpdateUserRoleRequest {
  @IsEnum(UserRole)
  role: UserRole;
}
