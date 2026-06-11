import { UserRole } from '../enums';

export interface UserDto {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  /** Computed display name ("Jane Doe") when both names are present. */
  name?: string;
  role: UserRole;
}
