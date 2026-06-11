import { UserRole } from '../enums';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

export interface LogoutResponse {
  message: string;
}
