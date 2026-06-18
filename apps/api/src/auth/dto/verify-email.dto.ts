import { IsNotEmpty } from 'class-validator';
import { VerifyEmailRequest } from '@hb/shared';

export class VerifyEmailDto implements VerifyEmailRequest {
  @IsNotEmpty()
  token: string;
}
