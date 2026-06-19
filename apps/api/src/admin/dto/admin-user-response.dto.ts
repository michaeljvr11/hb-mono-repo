import { AdminUserDto, UserRole } from '@hb/shared';

export class AdminUserResponseDto implements AdminUserDto {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  role: UserRole;
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
}
