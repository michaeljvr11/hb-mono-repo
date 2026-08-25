import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, QueryFailedError } from 'typeorm';
import { CountryCode, CurrencyCode } from '@hb/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import { ShippingFeeService } from './shipping-fee.service';
import { ShippingFee } from './entities/shipping-fee.entity';
import { CreateShippingFeeSetEntryDto } from './dto/create-shipping-fee-set.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a TypeORM QueryFailedError carrying a Postgres SQLSTATE, as pg-driver errors do. */
function pgError(code: string): QueryFailedError {
  return new QueryFailedError('INSERT ...', [], {
    code,
    toString: () => `error: duplicate key value violates unique constraint`,
  } as never);
}

const ALL_COUNTRIES: CountryCode[] = [CountryCode.SOUTH_AFRICA, CountryCode.NAMIBIA];
const ALL_CURRENCIES: CurrencyCode[] = [CurrencyCode.ZAR, CurrencyCode.NAD];

/** A complete, valid 8-entry (4 routes x 2 currencies) shipping fee set submission. */
function buildFullFeeEntries(amount = 0): CreateShippingFeeSetEntryDto[] {
  const entries: CreateShippingFeeSetEntryDto[] = [];
  for (const originCountry of ALL_COUNTRIES) {
    for (const destinationCountry of ALL_COUNTRIES) {
      for (const currency of ALL_CURRENCIES) {
        entries.push({
          originCountry,
          destinationCountry,
          currency,
          amount,
        });
      }
    }
  }
  return entries;
}

const makeRow = (overrides: Partial<ShippingFee> = {}): ShippingFee => ({
  id: 'fee-1',
  amount: '0.00' as unknown as number, // simulate the pg driver's numeric-as-string quirk
  currency: CurrencyCode.ZAR,
  originCountry: CountryCode.SOUTH_AFRICA,
  destinationCountry: CountryCode.NAMIBIA,
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  note: null,
  createdByUserId: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('ShippingFeeService', () => {
  let service: ShippingFeeService;
  let repo: Record<string, jest.Mock>;
  let txRepo: Record<string, jest.Mock>;
  let manager: Record<string, jest.Mock>;
  let dataSourceMock: Record<string, jest.Mock>;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    txRepo = {
      create: jest.fn((data: Partial<ShippingFee>) => ({ ...data })),
      save: jest.fn((rows: Partial<ShippingFee>[]) =>
        Promise.resolve(rows.map((row, i) => ({ ...makeRow(), ...row, id: `fee-${i}` }))),
      ),
    };

    manager = {
      getRepository: jest.fn(() => txRepo),
    };

    dataSourceMock = {
      transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        ShippingFeeService,
        { provide: getRepositoryToken(ShippingFee), useValue: repo },
        { provide: DataSource, useValue: dataSourceMock },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(ShippingFeeService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('saves a full 8-row set in one transaction and audit-logs it when there is no prior history', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.create(
        {
          fees: buildFullFeeEntries(100),
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          note: 'launch pricing',
        },
        'admin-1',
      );

      expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
      expect(txRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ amount: 100, createdByUserId: 'admin-1' }),
        ]),
      );
      const [savedRows] = txRepo.save.mock.calls[0] as [unknown[]];
      expect(savedRows.length).toBe(8);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: AuditAction.SHIPPING_FEE_CREATED,
          entityType: 'shipping_fee',
        }),
      );

      expect(result.fees).toHaveLength(8);
      expect(result.effectiveFrom).toBe('2026-01-01T00:00:00.000Z');
    });

    it('throws ConflictException when effectiveFrom is not after the latest set', async () => {
      repo.findOne.mockResolvedValue(
        makeRow({ effectiveFrom: new Date('2026-06-01T00:00:00.000Z') }),
      );

      await expect(
        service.create(
          { fees: buildFullFeeEntries(), effectiveFrom: '2026-05-01T00:00:00.000Z' },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(txRepo.save).not.toHaveBeenCalled();
    });

    it('throws ConflictException when effectiveFrom exactly equals the latest set (strictly-after rule)', async () => {
      repo.findOne.mockResolvedValue(
        makeRow({ effectiveFrom: new Date('2026-06-01T00:00:00.000Z') }),
      );

      await expect(
        service.create(
          { fees: buildFullFeeEntries(), effectiveFrom: '2026-06-01T00:00:00.000Z' },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(txRepo.save).not.toHaveBeenCalled();
    });

    it('rethrows a concurrent duplicate-effectiveFrom insert (pg 23505) as ConflictException', async () => {
      repo.findOne.mockResolvedValue(null);
      dataSourceMock.transaction.mockRejectedValue(pgError('23505'));

      await expect(
        service.create(
          { fees: buildFullFeeEntries(), effectiveFrom: '2026-01-01T00:00:00.000Z' },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an incomplete set that is missing a whole route (400)', async () => {
      repo.findOne.mockResolvedValue(null);
      // Drop both currency entries for the NA->ZA route.
      const entries = buildFullFeeEntries().filter(
        (e) =>
          !(
            e.originCountry === CountryCode.NAMIBIA &&
            e.destinationCountry === CountryCode.SOUTH_AFRICA
          ),
      );

      await expect(
        service.create({ fees: entries, effectiveFrom: '2026-01-01T00:00:00.000Z' }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    });

    it('rejects an incomplete set that is missing a whole currency (400)', async () => {
      repo.findOne.mockResolvedValue(null);
      // Drop every NAD entry — 4 of the 8 required combinations.
      const entries = buildFullFeeEntries().filter((e) => e.currency !== CurrencyCode.NAD);

      await expect(
        service.create({ fees: entries, effectiveFrom: '2026-01-01T00:00:00.000Z' }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    });

    it('rejects a set with a duplicated (route, currency) entry, even if it happens to total 8', async () => {
      repo.findOne.mockResolvedValue(null);
      const entries = buildFullFeeEntries().filter(
        (e) =>
          !(
            e.originCountry === CountryCode.NAMIBIA &&
            e.destinationCountry === CountryCode.SOUTH_AFRICA &&
            e.currency === CurrencyCode.NAD
          ),
      );
      // Now 7 entries; duplicate one of the remaining ones to get back to 8, but
      // still missing NA->ZA/NAD and doubling another combination.
      entries.push({ ...entries[0] });

      await expect(
        service.create({ fees: entries, effectiveFrom: '2026-01-01T00:00:00.000Z' }, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    });
  });

  // ─── list() ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('coerces numeric amount strings to numbers', async () => {
      repo.find.mockResolvedValue([makeRow({ amount: '250.00' as unknown as number })]);

      const result = await service.list();

      expect(result.items[0].fees[0].amount).toBe(250);
      expect(typeof result.items[0].fees[0].amount).toBe('number');
    });

    it('groups rows sharing an effectiveFrom into a single set', async () => {
      const effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
      repo.find.mockResolvedValue(
        buildFullFeeEntries().map((e, i) => makeRow({ id: `fee-${i}`, ...e, effectiveFrom })),
      );

      const result = await service.list();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].fees).toHaveLength(8);
    });

    it('flags the newest set whose effectiveFrom has passed as inForce', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

      repo.find.mockResolvedValue([
        makeRow({ id: 'future', effectiveFrom: new Date('2026-07-01T00:00:00.000Z') }),
        makeRow({ id: 'current', effectiveFrom: new Date('2026-06-01T00:00:00.000Z') }),
        makeRow({ id: 'past', effectiveFrom: new Date('2026-01-01T00:00:00.000Z') }),
      ]);

      const result = await service.list();

      expect(
        result.items.find((s) => s.effectiveFrom === '2026-07-01T00:00:00.000Z')?.inForce,
      ).toBe(false);
      expect(
        result.items.find((s) => s.effectiveFrom === '2026-06-01T00:00:00.000Z')?.inForce,
      ).toBe(true);
      expect(
        result.items.find((s) => s.effectiveFrom === '2026-01-01T00:00:00.000Z')?.inForce,
      ).toBe(false);

      jest.useRealTimers();
    });
  });

  // ─── getFeeAt() ─────────────────────────────────────────────────────────────

  describe('getFeeAt()', () => {
    it('resolves the row exactly on effectiveFrom (inclusive boundary)', async () => {
      const boundary = new Date('2026-06-01T00:00:00.000Z');
      repo.findOne.mockResolvedValue(makeRow({ id: 'boundary-row', effectiveFrom: boundary }));

      const result = await service.getFeeAt(
        boundary,
        CountryCode.SOUTH_AFRICA,
        CountryCode.NAMIBIA,
        CurrencyCode.ZAR,
      );

      expect(result.id).toBe('boundary-row');
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            originCountry: CountryCode.SOUTH_AFRICA,
            destinationCountry: CountryCode.NAMIBIA,
            currency: CurrencyCode.ZAR,
            effectiveFrom: LessThanOrEqual(boundary),
          },
          order: { effectiveFrom: 'DESC' },
        }),
      );
    });

    it('throws when no row covers the given (route, currency)', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.getFeeAt(
          new Date('1969-01-01T00:00:00.000Z'),
          CountryCode.SOUTH_AFRICA,
          CountryCode.NAMIBIA,
          CurrencyCode.ZAR,
        ),
      ).rejects.toThrow();
    });

    it('coerces amount to a number', async () => {
      repo.findOne.mockResolvedValue(makeRow({ amount: '199.99' as unknown as number }));

      const result = await service.getFeeAt(
        new Date(),
        CountryCode.SOUTH_AFRICA,
        CountryCode.NAMIBIA,
        CurrencyCode.ZAR,
      );

      expect(result.amount).toBe(199.99);
      expect(typeof result.amount).toBe('number');
    });

    it('never returns a ZA->NA fee for a NA->NA lookup — the query is scoped to the exact route', async () => {
      // Simulate a repo that actually enforces the where clause: only
      // matches when the queried route is NA->NA.
      repo.findOne.mockImplementation(
        (opts: { where: { originCountry: CountryCode; destinationCountry: CountryCode } }) => {
          if (
            opts.where.originCountry === CountryCode.NAMIBIA &&
            opts.where.destinationCountry === CountryCode.NAMIBIA
          ) {
            return Promise.resolve(null);
          }
          return Promise.resolve(
            makeRow({
              originCountry: CountryCode.SOUTH_AFRICA,
              destinationCountry: CountryCode.NAMIBIA,
            }),
          );
        },
      );

      await expect(
        service.getFeeAt(new Date(), CountryCode.NAMIBIA, CountryCode.NAMIBIA, CurrencyCode.ZAR),
      ).rejects.toThrow();

      const [findOneArg] = repo.findOne.mock.calls[repo.findOne.mock.calls.length - 1] as [
        { where: { originCountry: CountryCode; destinationCountry: CountryCode } },
      ];
      expect(findOneArg.where.originCountry).toBe(CountryCode.NAMIBIA);
      expect(findOneArg.where.destinationCountry).toBe(CountryCode.NAMIBIA);
    });
  });
});
