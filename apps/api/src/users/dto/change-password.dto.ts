import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ChangePasswordRequest } from '@hb/shared';

export class ChangePasswordDto implements ChangePasswordRequest {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
