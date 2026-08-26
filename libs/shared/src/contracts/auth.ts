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
  // NOTE: role is intentionally NOT part of self-registration. Public sign-up
  // always creates a CUSTOMER; the role is set server-side. Elevated roles are
  // assigned only via the admin-only PATCH /admin/users/:id/role path, and
  // vendor onboarding sets the role in VendorsService. See docs/security.
  /** When true, the refresh session is long-lived (30d) instead of short (24h). */
  rememberMe?: boolean;
  /**
   * Records that the user ticked the Terms of Service / Privacy Policy consent
   * checkbox at signup. Must be `true` — a missing or `false` value is rejected.
   * The acceptance timestamp itself is never trusted from the client; it is
   * derived server-side from request time when the audit record is written.
   */
  acceptedTerms: boolean;
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
  /**
   * One-time setup secret. Must match the server's ADMIN_BOOTSTRAP_SECRET when
   * one is configured (required in production). Guards the public bootstrap
   * endpoint against a first-caller-wins race on a fresh database.
   */
  secret?: string;
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
