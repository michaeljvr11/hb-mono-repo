import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePlatformSettingsDto } from './update-platform-settings.dto';

describe('UpdatePlatformSettingsDto', () => {
  it('accepts a valid array of emails', async () => {
    const dto = plainToInstance(UpdatePlatformSettingsDto, {
      notificationEmails: ['ops@hb.example', 'finance@hb.example'],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('accepts an empty array', async () => {
    const dto = plainToInstance(UpdatePlatformSettingsDto, { notificationEmails: [] });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid email anywhere in the array', async () => {
    const dto = plainToInstance(UpdatePlatformSettingsDto, {
      notificationEmails: ['ops@hb.example', 'not-an-email'],
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('notificationEmails');
  });

  it('rejects a non-array value', async () => {
    const dto = plainToInstance(UpdatePlatformSettingsDto, {
      notificationEmails: 'ops@hb.example',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an array larger than the max size guard', async () => {
    const dto = plainToInstance(UpdatePlatformSettingsDto, {
      notificationEmails: Array.from({ length: 51 }, (_, i) => `user${i}@hb.example`),
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
