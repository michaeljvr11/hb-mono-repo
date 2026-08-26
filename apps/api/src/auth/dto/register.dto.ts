import { Equals, IsBoolean, IsEmail, IsNotEmpty, IsOptional, MinLength } from 'class-validator';
import { RegisterRequest } from '@hb/shared';

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

  // No `role` field: self-registration must never let a client choose its role.
  // The global ValidationPipe (whitelist:true) strips any client-supplied `role`,
  // and AuthService.register forces CUSTOMER regardless. See docs/security.

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @IsBoolean()
  @Equals(true, {
    message: 'You must accept the Terms of Service and Privacy Policy to create an account.',
  })
  acceptedTerms: boolean;
}
