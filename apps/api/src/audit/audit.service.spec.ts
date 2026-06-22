import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditAction, AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeLog = (overrides: Partial<AuditLog> = {}): AuditLog => ({
  id: 'log-1',
  userId: 'u1',
  action: AuditAction.USER_ACTIVATED,
  entityType: 'user',
  entityId: 'u1',
  metadata: null,
  createdAt: new Date('2026-06-01T10:00:00.000Z'),
  ...overrides,
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('AuditService', () => {
  let service: AuditService;
  let repo: Record<string, jest.Mock>;

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
    };

    // create() returns whatever it receives so save() gets a plain object.
    repo.create.mockImplementation((data: Partial<AuditLog>) => ({ ...data }));

    const module = await Test.createTestingModule({
      providers: [AuditService, { provide: getRepositoryToken(AuditLog), useValue: repo }],
    }).compile();

    service = module.get(AuditService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── log() ──────────────────────────────────────────────────────────────────

  describe('log()', () => {
    it('persists an entry with the correct shape', async () => {
      repo.save.mockResolvedValue({});

      await service.log({
        userId: 'u1',
        action: AuditAction.VENDOR_STATUS_CHANGED,
        entityType: 'vendor',
        entityId: 'v1',
        metadata: { from: 'pending', to: 'approved' },
      });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          action: AuditAction.VENDOR_STATUS_CHANGED,
          entityType: 'vendor',
          entityId: 'v1',
          metadata: { from: 'pending', to: 'approved' },
        }),
      );
    });

    it('defaults userId to null when not provided', async () => {
      repo.save.mockResolvedValue({});

      await service.log({
        action: AuditAction.ADMIN_BOOTSTRAPPED,
        entityType: 'user',
        entityId: 'u2',
      });

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
    });

    it('swallows a repo error and does not throw (best-effort)', async () => {
      repo.save.mockRejectedValue(new Error('DB connection lost'));

      // Must not throw — calling code must never be broken by an audit failure.
      await expect(
        service.log({ action: AuditAction.USER_DEACTIVATED, entityType: 'user', entityId: 'u1' }),
      ).resolves.toBeUndefined();
    });
  });

  // ─── query() ────────────────────────────────────────────────────────────────

  describe('query()', () => {
    it('applies action, entityType, and userId equality filters when provided', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.query({
        action: AuditAction.PRODUCT_CREATED,
        entityType: 'product',
        userId: 'u1',
      });

      const [opts] = repo.findAndCount.mock.calls[0] as [{ where: Record<string, unknown> }];
      expect(opts.where['action']).toBe(AuditAction.PRODUCT_CREATED);
      expect(opts.where['entityType']).toBe('product');
      expect(opts.where['userId']).toBe('u1');
    });

    it('uses Between when both from and to are provided', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.query({ from: '2026-01-01T00:00:00.000Z', to: '2026-06-01T00:00:00.000Z' });

      const [opts] = repo.findAndCount.mock.calls[0] as [
        { where: Record<string, { type: string }> },
      ];
      expect(opts.where['createdAt'].type).toBe('between');
    });

    it('uses MoreThanOrEqual when only from is provided', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.query({ from: '2026-01-01T00:00:00.000Z' });

      const [opts] = repo.findAndCount.mock.calls[0] as [
        { where: Record<string, { type: string }> },
      ];
      expect(opts.where['createdAt'].type).toBe('moreThanOrEqual');
    });

    it('uses LessThanOrEqual when only to is provided', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.query({ to: '2026-06-01T00:00:00.000Z' });

      const [opts] = repo.findAndCount.mock.calls[0] as [
        { where: Record<string, { type: string }> },
      ];
      expect(opts.where['createdAt'].type).toBe('lessThanOrEqual');
    });

    it('paginates correctly and returns total, page, limit, pageCount', async () => {
      const logs = [makeLog(), makeLog({ id: 'log-2' })];
      repo.findAndCount.mockResolvedValue([logs, 45]);

      const result = await service.query({ page: 3, limit: 10 });

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.total).toBe(45);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.pageCount).toBe(5);
    });

    it('defaults page to 1 and limit to 20', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.query({});

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('caps limit at 100 even when a higher value is requested', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.query({ limit: 500 });

      expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    });

    it('maps rows to AuditLogDto with ISO createdAt', async () => {
      const log = makeLog({ createdAt: new Date('2026-06-01T10:00:00.000Z') });
      repo.findAndCount.mockResolvedValue([[log], 1]);

      const result = await service.query({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].createdAt).toBe('2026-06-01T10:00:00.000Z');
      expect(result.items[0].id).toBe('log-1');
    });

    it('orders results by createdAt DESC', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.query({});

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' } }),
      );
    });
  });
});
