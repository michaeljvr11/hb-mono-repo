import { IsBoolean, IsEmail, IsNotEmpty, IsOptional } from 'class-validator';
import { LoginRequest } from '@hb/shared';

export class LoginDto implements LoginRequest {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
