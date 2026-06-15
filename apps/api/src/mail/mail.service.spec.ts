import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MailService,
        // No RESEND_API_KEY configured.
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();

    service = module.get(MailService);
  });

  it('skips sending without throwing when RESEND_API_KEY is absent', async () => {
    await expect(service.sendPasswordReset('a@b.com', 'tok')).resolves.toBeUndefined();
    await expect(service.sendEmailVerification('a@b.com', 'tok')).resolves.toBeUndefined();
  });
});
