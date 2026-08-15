import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditAction, AuditService } from '../audit/audit.service';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformSettings } from './entities/platform-settings.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeRow = (overrides: Partial<PlatformSettings> = {}): PlatformSettings => ({
  id: 'settings-1',
  notificationEmails: [],
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedByUserId: null,
  ...overrides,
});

describe('PlatformSettingsService', () => {
  let service: PlatformSettingsService;
  let repo: Record<string, jest.Mock>;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };
    repo.create.mockImplementation((data: Partial<PlatformSettings>) => ({ ...data }));

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        PlatformSettingsService,
        { provide: getRepositoryToken(PlatformSettings), useValue: repo },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(PlatformSettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── get() ──────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns an empty array without throwing when no row exists', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.get()).resolves.toEqual({ notificationEmails: [] });
    });

    it('returns the configured recipients when a row exists', async () => {
      repo.findOne.mockResolvedValue(makeRow({ notificationEmails: ['ops@hb.example'] }));

      const result = await service.get();

      expect(result).toEqual({ notificationEmails: ['ops@hb.example'] });
    });
  });

  // ─── update() ───────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('persists the new recipient list and writes an audit entry when a row exists', async () => {
      const existing = makeRow({ notificationEmails: ['old@hb.example'] });
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockImplementation((row: PlatformSettings) => row);

      const result = await service.update(
        { notificationEmails: ['ops@hb.example', 'finance@hb.example'] },
        'admin-1',
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationEmails: ['ops@hb.example', 'finance@hb.example'],
          updatedByUserId: 'admin-1',
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: AuditAction.PLATFORM_SETTINGS_UPDATED,
          entityType: 'platform_settings',
          entityId: existing.id,
          metadata: { recipientCount: 2 },
        }),
      );
      expect(result.notificationEmails).toEqual(['ops@hb.example', 'finance@hb.example']);
    });

    it('creates the row when none exists yet', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockImplementation((row: PlatformSettings) => ({ ...row, id: 'settings-new' }));

      const result = await service.update({ notificationEmails: ['ops@hb.example'] }, 'admin-1');

      expect(repo.create).toHaveBeenCalledWith({ notificationEmails: [] });
      expect(repo.save).toHaveBeenCalled();
      expect(result.notificationEmails).toEqual(['ops@hb.example']);
    });
  });
});
