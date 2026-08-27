import { UserDto, UserRole } from '@hb/shared';

export class UserResponseDto implements UserDto {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  role: UserRole;
  isVerified?: boolean;
  termsAcceptedAt?: string | null;
}
