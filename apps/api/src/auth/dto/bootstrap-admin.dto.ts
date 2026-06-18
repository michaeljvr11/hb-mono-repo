import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { BootstrapAdminRequest } from '@hb/shared';

export class BootstrapAdminDto implements BootstrapAdminRequest {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
