import { IsOptional, IsString, MaxLength } from 'class-validator';
import { UpdateProfileRequest } from '@hb/shared';

export class UpdateProfileDto implements UpdateProfileRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;
}
