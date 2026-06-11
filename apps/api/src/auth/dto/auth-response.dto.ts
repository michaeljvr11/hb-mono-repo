import { AuthResponse, AuthUser } from '@hb/shared';

export class AuthResponseDto implements AuthResponse {
  access_token: string;
  user: AuthUser;
}
