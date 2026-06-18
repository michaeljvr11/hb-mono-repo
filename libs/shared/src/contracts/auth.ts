import { UserRole } from '../enums';

export interface LoginRequest {
  email: string;
  password: string;
  /** When true, the refresh session is long-lived (30d) instead of short (24h). */
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  /** When true, the refresh session is long-lived (30d) instead of short (24h). */
  rememberMe?: boolean;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  /** Raw token delivered by the password-reset email link. */
  token: string;
  password: string;
}

export interface VerifyEmailRequest {
  /** Raw token delivered by the email-verification link. */
  token: string;
}

export interface BootstrapAdminRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  isVerified?: boolean;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

export interface MessageResponse {
  message: string;
}

export type LogoutResponse = MessageResponse;
