import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

interface SendEmailPayload {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

const sendMock: jest.Mock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

function lastSendPayload(): SendEmailPayload {
  const calls = sendMock.mock.calls as unknown as SendEmailPayload[][];
  return calls[calls.length - 1][0];
}

function configuredConfig(overrides: Partial<Record<string, string>> = {}) {
  return {
    get: jest.fn((key: string, def?: unknown) => {
      if (key === 'RESEND_API_KEY') return overrides.RESEND_API_KEY ?? 'test-api-key';
      if (key === 'MAIL_FROM') return overrides.MAIL_FROM ?? def;
      if (key === 'APP_WEB_URL') return overrides.APP_WEB_URL ?? def;
      return def;
    }),
  };
}

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

describe('MailService with RESEND_API_KEY configured', () => {
  let service: MailService;

  beforeEach(async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null });

    const module = await Test.createTestingModule({
      providers: [MailService, { provide: ConfigService, useValue: configuredConfig() }],
    }).compile();

    service = module.get(MailService);
  });

  it('sends the password reset email through the branded shell with a 1-hour link', async () => {
    await service.sendPasswordReset('a@b.com', 'raw-token');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = lastSendPayload();
    expect(payload.to).toBe('a@b.com');
    expect(payload.html).toContain('<!doctype html>');
    expect(payload.html).toContain('href="http://localhost:4200/reset-password?token=raw-token"');
    expect(payload.html).toContain('This link expires in 1 hour.');
    expect(typeof payload.text).toBe('string');
    expect(payload.text.length).toBeGreaterThan(0);
  });

  it('sends the email verification email through the branded shell with a 24-hour link', async () => {
    await service.sendEmailVerification('a@b.com', 'raw-token');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = lastSendPayload();
    expect(payload.to).toBe('a@b.com');
    expect(payload.html).toContain('<!doctype html>');
    expect(payload.html).toContain('href="http://localhost:4200/verify-email?token=raw-token"');
    expect(payload.html).toContain('This link expires in 24 hours');
    expect(typeof payload.text).toBe('string');
    expect(payload.text.length).toBeGreaterThan(0);
  });

  it('does not throw out of sendPasswordReset when the transport rejects', async () => {
    sendMock.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(service.sendPasswordReset('a@b.com', 'raw-token')).resolves.toBeUndefined();
  });

  it('does not throw when the transport returns a returned error object', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'invalid domain' } });

    await expect(service.sendEmailVerification('a@b.com', 'raw-token')).resolves.toBeUndefined();
  });

  it('passes all recipients in a single dispatch when send() is called with an array', async () => {
    const recipients = ['a@b.com', 'c@d.com', 'e@f.com'];

    await (service as unknown as { send: (...args: unknown[]) => Promise<void> }).send(
      recipients,
      'Test subject',
      [{ type: 'paragraph', text: 'hi' }],
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(lastSendPayload().to).toEqual(recipients);
  });

  // apps/api runs with strictNullChecks: false, so an optional field reaching a
  // content block type-checks clean. TE-4 interpolates order_items.productName,
  // Vendor.businessName and shipping recipientName on the post-payment path,
  // where a render throw escaping send() would 500 an already-paid order.
  it('does not throw when a content block carries a nullish value', async () => {
    await expect(
      (service as unknown as { send: (...args: unknown[]) => Promise<void> }).send(
        'a@b.com',
        'Test subject',
        [
          { type: 'paragraph', text: undefined },
          { type: 'heading', text: null },
        ],
      ),
    ).resolves.toBeUndefined();

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('refuses to emit a non-http(s) link href', async () => {
    await (service as unknown as { send: (...args: unknown[]) => Promise<void> }).send(
      'a@b.com',
      'Test subject',
      [{ type: 'link', text: 'click', href: 'javascript:alert(1)' }],
    );

    const payload = lastSendPayload();
    expect(payload.html).not.toContain('javascript:');
    expect(payload.html).toContain('href="#"');
  });

  // ── TE-4: order.paid notifications ─────────────────────────────────────────

  it("sends a vendor order notification with that vendor's lines and explicit per-line currency, no total", async () => {
    await service.sendVendorOrderNotification('vendor@hb.com', 'Honey Co', 'order-1', [
      { productName: 'Fynbos Honey', unitPrice: 185, currency: 'ZAR', quantity: 2 },
    ]);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = lastSendPayload();
    expect(payload.to).toBe('vendor@hb.com');
    expect(payload.html).toContain('Honey Co');
    expect(payload.html).toContain('Fynbos Honey');
    expect(payload.html).toContain('185.00 ZAR');
    // Never a commission/earnings/payout figure or an order total.
    expect(payload.html.toLowerCase()).not.toContain('commission');
    expect(payload.html.toLowerCase()).not.toContain('total');
  });

  it('sends a platform order notification to every recipient with the full line list and order total', async () => {
    await service.sendPlatformOrderNotification(
      ['ops1@hb.com', 'ops2@hb.com'],
      'order-1',
      [
        {
          productName: 'Fynbos Honey',
          unitPrice: 185,
          currency: 'ZAR',
          quantity: 2,
          vendorId: 'v1',
        },
        { productName: 'Platform Widget', unitPrice: 50, currency: 'ZAR', quantity: 1 },
      ],
      420,
      'ZAR',
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = lastSendPayload();
    expect(payload.to).toEqual(['ops1@hb.com', 'ops2@hb.com']);
    expect(payload.html).toContain('Fynbos Honey');
    expect(payload.html).toContain('Platform Widget');
    expect(payload.html).toContain('420.00 ZAR');
  });

  // ── TE-5: customer order confirmation ───────────────────────────────────────

  it('sends a customer order confirmation with every line, the order total and explicit currency', async () => {
    await service.sendCustomerOrderConfirmation(
      'customer@hb.com',
      'Casey',
      'order-1',
      [
        { productName: 'Fynbos Honey', unitPrice: 185, currency: 'ZAR', quantity: 2 },
        { productName: 'Platform Widget', unitPrice: 50, currency: 'ZAR', quantity: 1 },
      ],
      420,
      'ZAR',
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = lastSendPayload();
    expect(payload.to).toBe('customer@hb.com');
    expect(payload.html).toContain('Casey');
    expect(payload.html).toContain('Fynbos Honey');
    expect(payload.html).toContain('Platform Widget');
    expect(payload.html).toContain('420.00 ZAR');
    // Never a commission/earnings/payout figure — those never leave
    // vendor/platform-ops mail (see the sendVendorOrderNotification doc comment).
    expect(payload.html.toLowerCase()).not.toContain('commission');
    expect(payload.html.toLowerCase()).not.toContain('payout');
  });

  it('renders the customer order confirmation with the explicit NAD currency, never converting to ZAR', async () => {
    await service.sendCustomerOrderConfirmation(
      'customer@hb.com',
      'Casey',
      'order-1',
      [{ productName: 'Fynbos Honey', unitPrice: 185, currency: 'NAD', quantity: 2 }],
      370,
      'NAD',
    );

    const payload = lastSendPayload();
    expect(payload.html).toContain('185.00 NAD');
    expect(payload.html).toContain('370.00 NAD');
  });
});
