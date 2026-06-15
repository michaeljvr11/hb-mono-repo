import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * Transactional email via Resend. The API key lives in apps/api/.env
 * (RESEND_API_KEY) — never committed. When the key is absent (CI / fresh dev
 * checkout) sends are skipped with a warning instead of throwing, so auth flows
 * keep working without email infrastructure configured.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private client: Resend | null = null;
  private clientResolved = false;

  constructor(private readonly config: ConfigService) {}

  async sendPasswordReset(email: string, rawToken: string): Promise<void> {
    const link = `${this.webUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.send(
      email,
      'Reset your H&B password',
      `<p>We received a request to reset your H&amp;B password.</p>
       <p><a href="${link}">Choose a new password</a>. This link expires in 1 hour.</p>
       <p>If you didn't ask for this, you can safely ignore this email.</p>`,
    );
  }

  async sendEmailVerification(email: string, rawToken: string): Promise<void> {
    const link = `${this.webUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    await this.send(
      email,
      'Verify your H&B email address',
      `<p>Welcome to H&amp;B.</p>
       <p><a href="${link}">Verify your email address</a> to unlock checkout. This link expires in 24 hours.</p>`,
    );
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    const client = this.getClient();
    if (!client) {
      this.logger.warn(`RESEND_API_KEY not set — skipping email "${subject}" to ${to}.`);
      return;
    }

    const { error } = await client.emails.send({ from: this.from(), to, subject, html });
    if (error) {
      // Don't let a transient email failure break the surrounding auth flow —
      // log and move on (the user can re-request reset / resend verification).
      this.logger.error(`Resend failed to send "${subject}" to ${to}: ${error.message}`);
    }
  }

  private getClient(): Resend | null {
    if (!this.clientResolved) {
      const apiKey = this.config.get<string>('RESEND_API_KEY');
      this.client = apiKey ? new Resend(apiKey) : null;
      this.clientResolved = true;
    }
    return this.client;
  }

  private from(): string {
    return this.config.get<string>('MAIL_FROM', 'no-reply@hb-ecommerce.com');
  }

  private webUrl(): string {
    return this.config.get<string>('APP_WEB_URL', 'http://localhost:4200');
  }
}
