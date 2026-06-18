import { IsNotEmpty, MinLength } from 'class-validator';
import { ResetPasswordRequest } from '@hb/shared';

export class ResetPasswordDto implements ResetPasswordRequest {
  @IsNotEmpty()
  token: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
