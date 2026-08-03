import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, QueryFailedError, Repository } from 'typeorm';
import { CommissionRateDto, CommissionRateListDto, CommissionRateListItemDto } from '@hb/shared';

import { CommissionRate } from './entities/commission-rate.entity';
import { CreateCommissionRateDto } from './dto/create-commission-rate.dto';
import { AuditAction, AuditService } from '../audit/audit.service';

function toDto(row: CommissionRate): CommissionRateDto {
  return {
    id: row.id,
    // numeric columns come back as strings from the pg driver — always coerce.
    ratePercent: Number(row.ratePercent),
    effectiveFrom: row.effectiveFrom.toISOString(),
    note: row.note ?? undefined,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId ?? undefined,
  };
}

@Injectable()
export class CommissionRateService {
  constructor(
    @InjectRepository(CommissionRate)
    private readonly commissionRateRepo: Repository<CommissionRate>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Append a new rate row. Rejects out-of-order inserts: a new row's
   * `effectiveFrom` must be strictly after the latest existing row's, so the
   * history stays monotonically ordered and `getRateAt` resolution stays
   * well-defined (append-only — there is deliberately no update/delete).
   */
  async create(dto: CreateCommissionRateDto, userId: string): Promise<CommissionRateDto> {
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    const latest = await this.commissionRateRepo.findOne({
      where: {},
      order: { effectiveFrom: 'DESC' },
    });

    if (latest && effectiveFrom <= latest.effectiveFrom) {
      throw new ConflictException(
        `effectiveFrom (${effectiveFrom.toISOString()}) must be strictly after the latest ` +
          `commission rate's effectiveFrom (${latest.effectiveFrom.toISOString()})`,
      );
    }

    let saved: CommissionRate;
    try {
      saved = await this.commissionRateRepo.save(
        this.commissionRateRepo.create({
          ratePercent: dto.ratePercent,
          effectiveFrom,
          note: dto.note ?? null,
          createdByUserId: userId ?? null,
        }),
      );
    } catch (err: unknown) {
      // Defense-in-depth against the race the read-then-write check above can't
      // close on its own: two concurrent creates can both read the same "latest"
      // row and both pass the in-app check before either commits. The unique
      // index on effectiveFrom (migration 1784419200000) is the real guarantee;
      // this turns its pg 23505 violation into the same ConflictException a
      // sequential out-of-order request gets, instead of a raw 500.
      const pgCode =
        err instanceof QueryFailedError
          ? (err.driverError as { code?: string } | undefined)?.code
          : undefined;
      if (pgCode === '23505') {
        throw new ConflictException(
          `A commission rate with effectiveFrom ${effectiveFrom.toISOString()} already exists`,
        );
      }
      throw err;
    }

    await this.auditService.log({
      userId,
      action: AuditAction.COMMISSION_RATE_CREATED,
      entityType: 'commission_rate',
      entityId: saved.id,
      metadata: { ratePercent: dto.ratePercent, effectiveFrom: effectiveFrom.toISOString() },
    });

    return toDto(saved);
  }

  /** Full history, newest `effectiveFrom` first, flagged with which row is currently in force. */
  async list(): Promise<CommissionRateListDto> {
    const rows = await this.commissionRateRepo.find({ order: { effectiveFrom: 'DESC' } });
    const now = new Date();
    // Rows are sorted newest-first, so the first row whose effectiveFrom has
    // already passed is the one in force.
    const inForceRow = rows.find((row) => row.effectiveFrom <= now);

    const items: CommissionRateListItemDto[] = rows.map((row) => ({
      ...toDto(row),
      inForce: inForceRow !== undefined && row.id === inForceRow.id,
    }));

    return { items };
  }

  /**
   * Resolves the rate in force at `date`: the row with the greatest
   * `effectiveFrom <= date`. Throws if no row covers that date — shouldn't
   * happen once the migration's seed row exists, but a caller (e.g. VE-3's
   * order-creation snapshot) must never silently fall back to an undefined rate.
   */
  async getRateAt(date: Date): Promise<CommissionRateDto> {
    const row = await this.commissionRateRepo.findOne({
      where: { effectiveFrom: LessThanOrEqual(date) },
      order: { effectiveFrom: 'DESC' },
    });

    if (!row) {
      throw new InternalServerErrorException(
        `No commission rate covers ${date.toISOString()} — the commission_rates table is missing its seed row`,
      );
    }

    return toDto(row);
  }
}
