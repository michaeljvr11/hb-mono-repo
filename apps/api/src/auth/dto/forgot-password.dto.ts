import { IsEmail, IsNotEmpty } from 'class-validator';
import { ForgotPasswordRequest } from '@hb/shared';

export class ForgotPasswordDto implements ForgotPasswordRequest {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
