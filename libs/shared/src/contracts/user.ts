import { UserRole } from '../enums';

export interface UserDto {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  /** Computed display name ("Jane Doe") when both names are present. */
  name?: string;
  role: UserRole;
  /** Whether the user has confirmed their email address. */
  isVerified?: boolean;
  /** ISO timestamp of terms acceptance, or `null` when there is no record.
   *  Mirrors `AuthUser.termsAcceptedAt` — the web app reads whichever of the
   *  two shapes is currently in `currentUser$`. */
  termsAcceptedAt?: string | null;
}

export interface AdminUserDto extends UserDto {
  isActive: boolean;
  createdAt: string; // ISO timestamp
}

export interface UpdateUserRoleRequest {
  role: UserRole;
}

export interface SetUserActiveRequest {
  isActive: boolean;
}

export interface AdminUserListQuery {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
