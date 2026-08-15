import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSettingsDto } from '@hb/shared';

import { PlatformSettings } from './entities/platform-settings.entity';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { AuditAction, AuditService } from '../audit/audit.service';

function toDto(row: PlatformSettings | null): PlatformSettingsDto {
  return { notificationEmails: row?.notificationEmails ?? [] };
}

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectRepository(PlatformSettings)
    private readonly platformSettingsRepo: Repository<PlatformSettings>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Reads the singleton settings row. The migration seeds exactly one row,
   * but this must never throw even if that row is somehow missing (e.g. a
   * hand-rolled dev DB) — a never-configured install resolves to an empty
   * `notificationEmails` array, which TE-4 treats as skip-and-warn.
   */
  async get(): Promise<PlatformSettingsDto> {
    const row = await this.platformSettingsRepo.findOne({ where: {} });
    return toDto(row);
  }

  /**
   * Replaces the full recipient list on the singleton row. If no row exists
   * yet, creates it (defense-in-depth alongside the migration's seed row).
   * Records the change in the audit log — who changed it and when, not the
   * email addresses themselves, since AuditService already captures actor +
   * action + timestamp and the addresses aren't sensitive PII beyond that.
   */
  async update(dto: UpdatePlatformSettingsDto, userId: string): Promise<PlatformSettingsDto> {
    let row = await this.platformSettingsRepo.findOne({ where: {} });

    if (!row) {
      row = this.platformSettingsRepo.create({ notificationEmails: [] });
    }

    row.notificationEmails = dto.notificationEmails;
    row.updatedByUserId = userId ?? null;
    const saved = await this.platformSettingsRepo.save(row);

    await this.auditService.log({
      userId,
      action: AuditAction.PLATFORM_SETTINGS_UPDATED,
      entityType: 'platform_settings',
      entityId: saved.id,
      metadata: { recipientCount: dto.notificationEmails.length },
    });

    return toDto(saved);
  }
}
