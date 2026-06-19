import { IsBoolean } from 'class-validator';
import { SetUserActiveRequest } from '@hb/shared';

export class SetUserActiveDto implements SetUserActiveRequest {
  @IsBoolean()
  isActive: boolean;
}
