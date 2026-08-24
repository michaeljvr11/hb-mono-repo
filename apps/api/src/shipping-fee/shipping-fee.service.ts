import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, QueryFailedError, Repository } from 'typeorm';
import {
  CountryCode,
  CurrencyCode,
  ShippingFeeDto,
  ShippingFeeHistoryDto,
  ShippingFeeSetDto,
} from '@hb/shared';

import { ShippingFee } from './entities/shipping-fee.entity';
import { CreateShippingFeeSetDto } from './dto/create-shipping-fee-set.dto';
import { AuditAction, AuditService } from '../audit/audit.service';

/** Every operating country, in declaration order. */
const ALL_COUNTRIES = Object.values(CountryCode);
/** Every accepted currency, in declaration order. */
const ALL_CURRENCIES = Object.values(CurrencyCode);

function routeCurrencyKey(
  originCountry: CountryCode,
  destinationCountry: CountryCode,
  currency: CurrencyCode,
): string {
  return `${originCountry}->${destinationCountry}:${currency}`;
}

/**
 * The complete set of (route, currency) combinations a shipping-fee set must
 * cover — every origin×destination country pair times every currency.
 * Derived from the shared enums rather than hardcoded, so it always tracks
 * `CountryCode`/`CurrencyCode` (currently 2 x 2 x 2 = 8).
 */
const REQUIRED_KEYS: readonly string[] = ALL_COUNTRIES.flatMap((originCountry) =>
  ALL_COUNTRIES.flatMap((destinationCountry) =>
    ALL_CURRENCIES.map((currency) => routeCurrencyKey(originCountry, destinationCountry, currency)),
  ),
);

function toDto(row: ShippingFee): ShippingFeeDto {
  return {
    id: row.id,
    // numeric columns come back as strings from the pg driver — always coerce.
    amount: Number(row.amount),
    currency: row.currency,
    originCountry: row.originCountry,
    destinationCountry: row.destinationCountry,
    effectiveFrom: row.effectiveFrom.toISOString(),
    note: row.note ?? undefined,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId ?? undefined,
  };
}

/** Groups a newest-first row list into one entry per distinct `effectiveFrom`,
 *  flagging the set that is currently in force. */
function groupByEffectiveFrom(rows: ShippingFee[]): ShippingFeeSetDto[] {
  const groups = new Map<string, ShippingFee[]>();
  for (const row of rows) {
    const key = row.effectiveFrom.toISOString();
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  // Map preserves insertion order; `rows` is already newest-first, so this is too.
  const effectiveFroms = [...groups.keys()];
  const now = new Date();
  const inForceKey = effectiveFroms.find((key) => new Date(key) <= now);

  return effectiveFroms.map((effectiveFrom) => ({
    effectiveFrom,
    fees: groups.get(effectiveFrom).map(toDto),
    inForce: effectiveFrom === inForceKey,
  }));
}

@Injectable()
export class ShippingFeeService {
  constructor(
    @InjectRepository(ShippingFee)
    private readonly shippingFeeRepo: Repository<ShippingFee>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Appends a new 8-row shipping-fee set (4 routes x 2 currencies), all
   * sharing one `effectiveFrom`, in a single transaction. Rejects an
   * incomplete or duplicated set with 400, and rejects an `effectiveFrom`
   * that is not strictly after the latest existing set with 409 — the
   * append-only history mirrors CommissionRateService.create, extended to
   * insert a whole route x currency set at once instead of one row.
   */
  async create(dto: CreateShippingFeeSetDto, userId: string): Promise<ShippingFeeSetDto> {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of dto.fees) {
      const key = routeCurrencyKey(entry.originCountry, entry.destinationCountry, entry.currency);
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    if (duplicates.length > 0) {
      throw new BadRequestException(
        `Duplicate (route, currency) combinations in shipping fee set: ${duplicates.join(', ')}`,
      );
    }

    const missing = REQUIRED_KEYS.filter((key) => !seen.has(key));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Shipping fee set is missing required (route, currency) combinations: ${missing.join(', ')}`,
      );
    }

    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    const latest = await this.shippingFeeRepo.findOne({
      where: {},
      order: { effectiveFrom: 'DESC' },
    });

    if (latest && effectiveFrom <= latest.effectiveFrom) {
      throw new ConflictException(
        `effectiveFrom (${effectiveFrom.toISOString()}) must be strictly after the latest ` +
          `shipping fee set's effectiveFrom (${latest.effectiveFrom.toISOString()})`,
      );
    }

    let saved: ShippingFee[];
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(ShippingFee);
        const rows = dto.fees.map((entry) =>
          repo.create({
            amount: entry.amount,
            currency: entry.currency,
            originCountry: entry.originCountry,
            destinationCountry: entry.destinationCountry,
            effectiveFrom,
            note: dto.note ?? null,
            createdByUserId: userId ?? null,
          }),
        );
        return repo.save(rows);
      });
    } catch (err: unknown) {
      // Defense-in-depth against the race the read-then-write check above can't
      // close on its own — see CommissionRateService.create for the same
      // reasoning. The unique index on (effectiveFrom, originCountry,
      // destinationCountry, currency) is the real guarantee; this turns its
      // pg 23505 violation into the same ConflictException a sequential
      // out-of-order request gets, instead of a raw 500.
      const pgCode =
        err instanceof QueryFailedError
          ? (err.driverError as { code?: string } | undefined)?.code
          : undefined;
      if (pgCode === '23505') {
        throw new ConflictException(
          `A shipping fee set with effectiveFrom ${effectiveFrom.toISOString()} already exists`,
        );
      }
      throw err;
    }

    await this.auditService.log({
      userId,
      action: AuditAction.SHIPPING_FEE_CREATED,
      entityType: 'shipping_fee',
      entityId: saved[0]?.id ?? '',
      metadata: {
        effectiveFrom: effectiveFrom.toISOString(),
        fees: dto.fees.map((f) => ({
          originCountry: f.originCountry,
          destinationCountry: f.destinationCountry,
          currency: f.currency,
          amount: f.amount,
        })),
      },
    });

    // The strictly-after check above guarantees this new effectiveFrom is
    // the greatest in the table, so it is in force iff it isn't scheduled
    // for the future.
    return {
      effectiveFrom: effectiveFrom.toISOString(),
      fees: saved.map(toDto),
      inForce: effectiveFrom <= new Date(),
    };
  }

  /** Full history, newest `effectiveFrom` first, grouped into one set per change and flagged inForce. */
  async list(): Promise<ShippingFeeHistoryDto> {
    const rows = await this.shippingFeeRepo.find({ order: { effectiveFrom: 'DESC' } });
    return { items: groupByEffectiveFrom(rows) };
  }

  /**
   * Resolves the fee in force at `date` for an exact (route, currency): the
   * row with the greatest `effectiveFrom <= date` for that
   * (originCountry, destinationCountry, currency) triple. Never falls back
   * to another route or currency, and never returns 0 as a default — throws
   * if nothing covers it, shouldn't happen once the migration's seed set
   * exists, but a caller (e.g. SF-3's order-creation resolution) must never
   * silently use an undefined fee.
   */
  async getFeeAt(
    date: Date,
    originCountry: CountryCode,
    destinationCountry: CountryCode,
    currency: CurrencyCode,
  ): Promise<ShippingFeeDto> {
    const row = await this.shippingFeeRepo.findOne({
      where: {
        originCountry,
        destinationCountry,
        currency,
        effectiveFrom: LessThanOrEqual(date),
      },
      order: { effectiveFrom: 'DESC' },
    });

    if (!row) {
      throw new InternalServerErrorException(
        `No shipping fee covers ${originCountry}->${destinationCountry} in ${currency} at ` +
          `${date.toISOString()} — the shipping_fees table is missing its seed row`,
      );
    }

    return toDto(row);
  }
}
