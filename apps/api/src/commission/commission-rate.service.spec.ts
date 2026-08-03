import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThanOrEqual } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service';
import { CommissionRateService } from './commission-rate.service';
import { CommissionRate } from './entities/commission-rate.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeRow = (overrides: Partial<CommissionRate> = {}): CommissionRate => ({
  id: 'rate-1',
  ratePercent: '15.00' as unknown as number, // simulate the pg driver's numeric-as-string quirk
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  note: null,
  createdByUserId: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('CommissionRateService', () => {
  let service: CommissionRateService;
  let repo: Record<string, jest.Mock>;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    repo.create.mockImplementation((data: Partial<CommissionRate>) => ({ ...data }));

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        CommissionRateService,
        { provide: getRepositoryToken(CommissionRate), useValue: repo },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(CommissionRateService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('saves a new row and audit-logs it when there is no prior history', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockImplementation((data: Partial<CommissionRate>) => ({
        ...makeRow(),
        ...data,
        id: 'rate-new',
      }));

      const result = await service.create(
        { ratePercent: 15, effectiveFrom: '2026-01-01T00:00:00.000Z' },
        'admin-1',
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ ratePercent: 15, createdByUserId: 'admin-1' }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: AuditAction.COMMISSION_RATE_CREATED,
          entityType: 'commission_rate',
          entityId: 'rate-new',
          metadata: { ratePercent: 15, effectiveFrom: '2026-01-01T00:00:00.000Z' },
        }),
      );
      expect(result.ratePercent).toBe(15);
    });

    it('defaults effectiveFrom to now() when omitted', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.save.mockImplementation((data: Partial<CommissionRate>) => ({
        ...makeRow(),
        ...data,
      }));

      const before = Date.now();
      await service.create({ ratePercent: 20 }, 'admin-1');
      const after = Date.now();

      const [savedArg] = repo.save.mock.calls[0] as [{ effectiveFrom: Date }];
      expect(savedArg.effectiveFrom.getTime()).toBeGreaterThanOrEqual(before);
      expect(savedArg.effectiveFrom.getTime()).toBeLessThanOrEqual(after);
    });

    it('throws ConflictException when effectiveFrom is not after the latest row', async () => {
      repo.findOne.mockResolvedValue(
        makeRow({ effectiveFrom: new Date('2026-06-01T00:00:00.000Z') }),
      );

      await expect(
        service.create({ ratePercent: 20, effectiveFrom: '2026-05-01T00:00:00.000Z' }, 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when effectiveFrom exactly equals the latest row (strictly-after rule)', async () => {
      repo.findOne.mockResolvedValue(
        makeRow({ effectiveFrom: new Date('2026-06-01T00:00:00.000Z') }),
      );

      await expect(
        service.create({ ratePercent: 20, effectiveFrom: '2026-06-01T00:00:00.000Z' }, 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('allows an effectiveFrom strictly after the latest row', async () => {
      repo.findOne.mockResolvedValue(
        makeRow({ effectiveFrom: new Date('2026-06-01T00:00:00.000Z') }),
      );
      repo.save.mockImplementation((data: Partial<CommissionRate>) => ({ ...makeRow(), ...data }));

      await expect(
        service.create({ ratePercent: 20, effectiveFrom: '2026-06-01T00:00:00.001Z' }, 'admin-1'),
      ).resolves.toBeDefined();
      expect(repo.save).toHaveBeenCalled();
    });
  });

  // ─── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('coerces numeric ratePercent strings to numbers', async () => {
      repo.find.mockResolvedValue([makeRow({ ratePercent: '17.50' as unknown as number })]);

      const result = await service.list();

      expect(result.items[0].ratePercent).toBe(17.5);
      expect(typeof result.items[0].ratePercent).toBe('number');
    });

    it('flags the newest row whose effectiveFrom has passed as inForce', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

      repo.find.mockResolvedValue([
        makeRow({ id: 'future', effectiveFrom: new Date('2026-07-01T00:00:00.000Z') }),
        makeRow({ id: 'current', effectiveFrom: new Date('2026-06-01T00:00:00.000Z') }),
        makeRow({ id: 'past', effectiveFrom: new Date('2026-01-01T00:00:00.000Z') }),
      ]);

      const result = await service.list();

      expect(result.items.find((i) => i.id === 'future')?.inForce).toBe(false);
      expect(result.items.find((i) => i.id === 'current')?.inForce).toBe(true);
      expect(result.items.find((i) => i.id === 'past')?.inForce).toBe(false);

      jest.useRealTimers();
    });

    it('flags no row as inForce when every row is in the future', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2020-01-01T00:00:00.000Z'));

      repo.find.mockResolvedValue([
        makeRow({ effectiveFrom: new Date('2026-01-01T00:00:00.000Z') }),
      ]);

      const result = await service.list();

      expect(result.items.every((i) => !i.inForce)).toBe(true);

      jest.useRealTimers();
    });
  });

  // ─── getRateAt() ────────────────────────────────────────────────────────────

  describe('getRateAt()', () => {
    it('resolves the row exactly on effectiveFrom (inclusive boundary)', async () => {
      const boundary = new Date('2026-06-01T00:00:00.000Z');
      repo.findOne.mockResolvedValue(makeRow({ id: 'boundary-row', effectiveFrom: boundary }));

      const result = await service.getRateAt(boundary);

      expect(result.id).toBe('boundary-row');
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { effectiveFrom: LessThanOrEqual(boundary) },
          order: { effectiveFrom: 'DESC' },
        }),
      );
    });

    it('resolves the prior row one millisecond before the boundary', async () => {
      // Assert the service queries with LessThanOrEqual(the exact date given) —
      // pins the operator, not just the mocked return value, so swapping
      // LessThanOrEqual for LessThan (which would wrongly exclude the boundary
      // row) fails this test.
      const oneMsBefore = new Date('2026-05-31T23:59:59.999Z');
      repo.findOne.mockResolvedValue(
        makeRow({ id: 'prior-row', effectiveFrom: new Date('2026-01-01T00:00:00.000Z') }),
      );

      const result = await service.getRateAt(oneMsBefore);

      expect(result.id).toBe('prior-row');
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { effectiveFrom: LessThanOrEqual(oneMsBefore) } }),
      );
    });

    it('resolves the correct row between two history entries', async () => {
      const between = new Date('2026-03-15T00:00:00.000Z');
      repo.findOne.mockResolvedValue(
        makeRow({ id: 'mid-row', effectiveFrom: new Date('2026-02-01T00:00:00.000Z') }),
      );

      const result = await service.getRateAt(between);

      expect(result.id).toBe('mid-row');
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { effectiveFrom: LessThanOrEqual(between) } }),
      );
    });

    it('resolves the newest row when queried after every history entry', async () => {
      const afterAll = new Date('2099-01-01T00:00:00.000Z');
      repo.findOne.mockResolvedValue(
        makeRow({ id: 'newest-row', effectiveFrom: new Date('2026-06-01T00:00:00.000Z') }),
      );

      const result = await service.getRateAt(afterAll);

      expect(result.id).toBe('newest-row');
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { effectiveFrom: LessThanOrEqual(afterAll) } }),
      );
    });

    it('throws when no row covers the given date', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.getRateAt(new Date('1969-01-01T00:00:00.000Z'))).rejects.toThrow();
    });

    it('coerces ratePercent to a number', async () => {
      repo.findOne.mockResolvedValue(makeRow({ ratePercent: '12.34' as unknown as number }));

      const result = await service.getRateAt(new Date());

      expect(result.ratePercent).toBe(12.34);
      expect(typeof result.ratePercent).toBe('number');
    });
  });
});
