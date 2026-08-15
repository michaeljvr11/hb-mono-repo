import { ArrayMaxSize, IsArray, IsEmail } from 'class-validator';
import { UpdatePlatformSettingsRequest } from '@hb/shared';

export class UpdatePlatformSettingsDto implements UpdatePlatformSettingsRequest {
  @IsArray()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  notificationEmails: string[];
}
