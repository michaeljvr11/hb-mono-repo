import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailContentBlock, renderEmail } from './email-template';

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
    await this.send(email, 'Reset your H&B password', [
      { type: 'paragraph', text: 'We received a request to reset your H&B password.' },
      { type: 'link', text: 'Choose a new password', href: link },
      { type: 'paragraph', text: 'This link expires in 1 hour.' },
      { type: 'paragraph', text: "If you didn't ask for this, you can safely ignore this email." },
    ]);
  }

  async sendEmailVerification(email: string, rawToken: string): Promise<void> {
    const link = `${this.webUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    await this.send(email, 'Verify your H&B email address', [
      { type: 'paragraph', text: 'Welcome to H&B.' },
      { type: 'link', text: 'Verify your email address', href: link },
      { type: 'paragraph', text: 'This link expires in 24 hours and unlocks checkout.' },
    ]);
  }

  /**
   * The single transport seam. Rendering, client resolution and dispatch all
   * sit inside the try: this is the boundary that guarantees no email failure
   * escapes into a caller, and a renderer or config throw would otherwise
   * sidestep it. Callers hand over content blocks rather than HTML precisely
   * so nothing is rendered outside this guard.
   */
  private async send(
    to: string | string[],
    subject: string,
    blocks: EmailContentBlock[],
  ): Promise<void> {
    const recipients = Array.isArray(to) ? to.join(', ') : to;

    try {
      const client = this.getClient();
      if (!client) {
        this.logger.warn(`RESEND_API_KEY not set — skipping email "${subject}" to ${recipients}.`);
        return;
      }

      const { html, text } = renderEmail(subject, blocks);
      const { error } = await client.emails.send({ from: this.from(), to, subject, html, text });
      if (error) {
        // Don't let a transient email failure break the surrounding flow —
        // log and move on (the user can re-request reset / resend verification).
        this.logger.error(`Resend failed to send "${subject}" to ${recipients}: ${error.message}`);
      }
    } catch (err) {
      // A rejected transport call (DNS failure, socket timeout, 5xx) — or a
      // render failure — must never propagate out of send(). Callers on
      // unrecoverable paths can't survive an email throw: orders.service
      // awaits capturePayment *after* the stock transaction has committed, so
      // a throw there means a 500 to a customer whose stock is gone and whose
      // payment was captured.
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
