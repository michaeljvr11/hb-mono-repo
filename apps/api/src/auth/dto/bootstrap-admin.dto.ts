import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { BootstrapAdminRequest } from '@hb/shared';

export class BootstrapAdminDto implements BootstrapAdminRequest {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;

  // Must match the server's ADMIN_BOOTSTRAP_SECRET when one is configured
  // (required in production). Validated server-side in AuthService.
  @IsOptional()
  @IsString()
  secret?: string;
}
