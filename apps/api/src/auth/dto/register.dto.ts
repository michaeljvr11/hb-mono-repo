import { IsEmail, IsEnum, IsNotEmpty, IsOptional, MinLength } from 'class-validator';
import { RegisterRequest, UserRole } from '@hb/shared';

export class RegisterDto implements RegisterRequest {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsNotEmpty()
  firstName?: string;

  @IsOptional()
  @IsNotEmpty()
  lastName?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole; // defaults to CUSTOMER; admins create vendors
}
