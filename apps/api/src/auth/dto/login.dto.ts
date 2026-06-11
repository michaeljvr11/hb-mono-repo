import { IsEmail, IsNotEmpty } from 'class-validator';
import { LoginRequest } from '@hb/shared';

export class LoginDto implements LoginRequest {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  password: string;
}
