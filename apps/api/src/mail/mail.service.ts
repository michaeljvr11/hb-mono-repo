import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { renderEmail } from './email-template';

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
    const subject = 'Reset your H&B password';
    const { html, text } = renderEmail(subject, [
      { type: 'paragraph', text: 'We received a request to reset your H&B password.' },
      { type: 'link', text: 'Choose a new password', href: link },
      { type: 'paragraph', text: 'This link expires in 1 hour.' },
      { type: 'paragraph', text: "If you didn't ask for this, you can safely ignore this email." },
    ]);
    await this.send(email, subject, html, text);
  }

  async sendEmailVerification(email: string, rawToken: string): Promise<void> {
    const link = `${this.webUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const subject = 'Verify your H&B email address';
    const { html, text } = renderEmail(subject, [
      { type: 'paragraph', text: 'Welcome to H&B.' },
      { type: 'link', text: 'Verify your email address', href: link },
      { type: 'paragraph', text: 'This link expires in 24 hours and unlocks checkout.' },
    ]);
    await this.send(email, subject, html, text);
  }

  private async send(
    to: string | string[],
    subject: string,
    html: string,
    text: string,
  ): Promise<void> {
    const client = this.getClient();
    const recipients = Array.isArray(to) ? to.join(', ') : to;

    if (!client) {
      this.logger.warn(`RESEND_API_KEY not set — skipping email "${subject}" to ${recipients}.`);
      return;
    }

    try {
      const { error } = await client.emails.send({ from: this.from(), to, subject, html, text });
      if (error) {
        // Don't let a transient email failure break the surrounding flow —
        // log and move on (the user can re-request reset / resend verification).
        this.logger.error(`Resend failed to send "${subject}" to ${recipients}: ${error.message}`);
      }
    } catch (err) {
      // A rejected transport call (DNS failure, socket timeout, 5xx) must
      // never propagate out of send() — callers on unrecoverable paths
      // (e.g. paid-order confirmation) can't survive an email throw.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Resend transport error sending "${subject}" to ${recipients}: ${message}`);
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
