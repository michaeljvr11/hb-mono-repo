import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactInquiryDto } from '@hb/shared';
import { ContactInquiry } from './entities/contact-inquiry.entity';
import { CreateContactInquiryDto } from './dto/create-contact-inquiry.dto';
import { MailService } from '../mail/mail.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';

/**
 * Contact-form intake (LSM-5). Persist FIRST, notify SECOND: the DB row is
 * the durable record of the lead, so a Resend outage must never lose it.
 * MailService.send() already swallows every transport failure internally
 * (never throws), but notifyPlatform is additionally wrapped defensively
 * here — same belt-and-braces shape as OrderNotificationsListener.safely()
 * — so even a bug upstream of the transport (e.g. a throw while resolving
 * recipients) can never turn a successfully-persisted inquiry into a 500.
 */
@Injectable()
export class InquiriesService {
  private readonly logger = new Logger(InquiriesService.name);

  constructor(
    @InjectRepository(ContactInquiry)
    private readonly contactInquiryRepository: Repository<ContactInquiry>,
    private readonly mailService: MailService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  async create(dto: CreateContactInquiryDto): Promise<ContactInquiryDto> {
    const inquiry = this.contactInquiryRepository.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      orderType: dto.orderType,
      referenceNumber: dto.referenceNumber,
      message: dto.message,
    });
    const saved = await this.contactInquiryRepository.save(inquiry);

    await this.notifyPlatform(saved);

    return { id: saved.id, receivedAt: saved.createdAt.toISOString() };
  }

  /**
   * Same skip-and-warn pattern as order.paid platform notifications (see
   * OrderNotificationsListener.notifyPlatform): an install with no
   * recipients configured yet must not throw or block the response. The
   * whole body is wrapped so any failure here — recipient lookup or mail
   * dispatch — is logged and swallowed, never propagated to the caller.
   */
  private async notifyPlatform(inquiry: ContactInquiry): Promise<void> {
    try {
      const { notificationEmails } = await this.platformSettingsService.get();
      if (!notificationEmails.length) {
        this.logger.warn(
          `No platform notification recipients configured — skipping contact inquiry ${inquiry.id}`,
        );
        return;
      }

      await this.mailService.sendContactInquiryNotification(notificationEmails, {
        id: inquiry.id,
        name: inquiry.name,
        email: inquiry.email,
        phone: inquiry.phone,
        orderType: inquiry.orderType,
        referenceNumber: inquiry.referenceNumber,
        message: inquiry.message,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Contact inquiry notification failed (${inquiry.id}): ${message}`);
    }
  }
}
