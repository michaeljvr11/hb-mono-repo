import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { InquiryOrderType } from '@hb/shared';
import { InquiriesService } from './inquiries.service';
import { ContactInquiry } from './entities/contact-inquiry.entity';
import { MailService } from '../mail/mail.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { CreateContactInquiryDto } from './dto/create-contact-inquiry.dto';

const NOW = new Date('2026-08-16T12:00:00.000Z');

function makeDto(overrides: Partial<CreateContactInquiryDto> = {}): CreateContactInquiryDto {
  const dto = new CreateContactInquiryDto();
  dto.name = 'Casey Customer';
  dto.email = 'casey@example.com';
  dto.orderType = InquiryOrderType.ONE_TIME;
  dto.message = 'Do you stock rooibos tea in bulk?';
  Object.assign(dto, overrides);
  return dto;
}

function makeSavedInquiry(overrides: Partial<ContactInquiry> = {}): ContactInquiry {
  return {
    id: 'inquiry-1',
    name: 'Casey Customer',
    email: 'casey@example.com',
    phone: undefined,
    orderType: InquiryOrderType.ONE_TIME,
    referenceNumber: undefined,
    message: 'Do you stock rooibos tea in bulk?',
    createdAt: NOW,
    ...overrides,
  };
}

describe('InquiriesService', () => {
  let service: InquiriesService;
  let repo: Record<string, jest.Mock>;
  let mailService: Record<string, jest.Mock>;
  let platformSettingsService: Record<string, jest.Mock>;

  beforeEach(async () => {
    repo = {
      create: jest.fn((x: Partial<ContactInquiry>) => x as ContactInquiry),
      save: jest.fn((x: Partial<ContactInquiry>) => Promise.resolve(makeSavedInquiry(x))),
    };
    mailService = { sendContactInquiryNotification: jest.fn().mockResolvedValue(undefined) };
    platformSettingsService = {
      get: jest.fn().mockResolvedValue({ notificationEmails: ['ops@hb.com'] }),
    };

    const module = await Test.createTestingModule({
      providers: [
        InquiriesService,
        { provide: getRepositoryToken(ContactInquiry), useValue: repo },
        { provide: MailService, useValue: mailService },
        { provide: PlatformSettingsService, useValue: platformSettingsService },
      ],
    }).compile();

    service = module.get(InquiriesService);
  });

  // ── persistence ──────────────────────────────────────────────────────────

  it('persists the inquiry and returns the thin DTO (id + receivedAt), never echoing the payload', async () => {
    const dto = makeDto();

    const result = await service.create(dto);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Casey Customer',
        email: 'casey@example.com',
        orderType: InquiryOrderType.ONE_TIME,
        message: 'Do you stock rooibos tea in bulk?',
      }),
    );
    expect(result).toEqual({ id: 'inquiry-1', receivedAt: NOW.toISOString() });
    expect(Object.keys(result)).toEqual(['id', 'receivedAt']);
  });

  it('carries optional phone and referenceNumber through to the saved row', async () => {
    const dto = makeDto({ phone: '+264811234567', referenceNumber: 'ORD-123' });

    await service.create(dto);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+264811234567', referenceNumber: 'ORD-123' }),
    );
  });

  // ── persist-first-notify-second ordering ────────────────────────────────

  it('persists before notifying — save() is called before sendContactInquiryNotification()', async () => {
    const calls: string[] = [];
    repo.save.mockImplementation((x: Partial<ContactInquiry>) => {
      calls.push('save');
      return Promise.resolve(makeSavedInquiry(x));
    });
    mailService.sendContactInquiryNotification.mockImplementation(() => {
      calls.push('notify');
      return Promise.resolve(undefined);
    });

    await service.create(makeDto());

    expect(calls).toEqual(['save', 'notify']);
  });

  it('notifies every configured platform recipient with the saved inquiry details', async () => {
    platformSettingsService.get.mockResolvedValue({
      notificationEmails: ['ops1@hb.com', 'ops2@hb.com'],
    });

    await service.create(makeDto({ phone: '+27821234567' }));

    expect(mailService.sendContactInquiryNotification).toHaveBeenCalledWith(
      ['ops1@hb.com', 'ops2@hb.com'],
      expect.objectContaining({
        id: 'inquiry-1',
        name: 'Casey Customer',
        email: 'casey@example.com',
        phone: '+27821234567',
      }),
    );
  });

  // ── mail-failure path: a mail failure must never fail the request ──────────

  it('still returns the DTO successfully when the mail notification rejects (mail failure must not fail the request)', async () => {
    mailService.sendContactInquiryNotification.mockRejectedValue(new Error('Resend down'));

    await expect(service.create(makeDto())).resolves.toEqual({
      id: 'inquiry-1',
      receivedAt: NOW.toISOString(),
    });
  });

  it('still returns the DTO successfully when resolving notification recipients throws', async () => {
    platformSettingsService.get.mockRejectedValue(new Error('DB connection lost'));

    await expect(service.create(makeDto())).resolves.toEqual({
      id: 'inquiry-1',
      receivedAt: NOW.toISOString(),
    });
  });

  it('skips notification without throwing when no platform recipients are configured', async () => {
    platformSettingsService.get.mockResolvedValue({ notificationEmails: [] });

    const result = await service.create(makeDto());

    expect(mailService.sendContactInquiryNotification).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'inquiry-1', receivedAt: NOW.toISOString() });
  });

  // ── validation rejection ────────────────────────────────────────────────

  it('rejects an invalid orderType at the DTO layer via class-validator (not the service)', async () => {
    const dto = makeDto();
    (dto as unknown as { orderType: string }).orderType = 'not_a_real_type';

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'orderType')).toBe(true);
  });

  it('rejects a missing/invalid email at the DTO layer via class-validator', async () => {
    const dto = makeDto({ email: 'not-an-email' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects an over-length message at the DTO layer via class-validator', async () => {
    const dto = makeDto({ message: 'x'.repeat(5001) });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'message')).toBe(true);
  });

  // The endpoint is @Public — the web form's `required` validators guard the
  // browser, nothing guards a direct POST. An empty name/message is a junk row
  // AND an email to ops, so emptiness is rejected here rather than trusted.
  it.each([['name'], ['message']])(
    'rejects an empty %s at the DTO layer',
    async (property: string) => {
      const dto = makeDto({ [property]: '' });

      const errors = await validate(dto);

      expect(errors.some((e) => e.property === property)).toBe(true);
    },
  );

  it.each([['name'], ['message']])(
    'rejects a whitespace-only %s once trimmed',
    async (property: string) => {
      // plainToInstance runs the @Transform trim that ValidationPipe applies in
      // production (transform: true in main.ts) — without it "   " is a
      // three-character string that satisfies every validator.
      const dto = plainToInstance(CreateContactInquiryDto, {
        ...makeDto(),
        [property]: '   ',
      });

      const errors = await validate(dto);

      expect(errors.some((e) => e.property === property)).toBe(true);
    },
  );

  it('trims surrounding whitespace off submitted values before they are persisted', () => {
    const dto = plainToInstance(CreateContactInquiryDto, {
      ...makeDto(),
      name: '  Casey Customer  ',
      email: '  casey@example.com  ',
    });

    expect(dto.name).toBe('Casey Customer');
    expect(dto.email).toBe('casey@example.com');
  });
});
