import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { AuditLogDto, AuditLogListDto, AuditLogListQuery } from '@hb/shared';

import { AuditLog } from './entities/audit-log.entity';

/** Canonical action keys — use these constants instead of raw strings to avoid
 *  typos and to make cross-module usage greppable. */
export const AuditAction = {
  VENDOR_STATUS_CHANGED: 'vendor.status_changed',
  USER_ROLE_ASSIGNED: 'user.role_assigned',
  USER_ACTIVATED: 'user.activated',
  USER_DEACTIVATED: 'user.deactivated',
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  ADMIN_BOOTSTRAPPED: 'admin.bootstrapped',
} as const;

function toDto(log: AuditLog): AuditLogDto {
  return {
    id: log.id,
    userId: log.userId,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
  };
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  /**
   * Best-effort audit write. Errors are swallowed and logged as warnings so
   * a transient DB hiccup never breaks the business action that called this.
   */
  async log(entry: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.auditLogRepo.save(
        this.auditLogRepo.create({
          userId: entry.userId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: entry.metadata ?? null,
        }),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Audit log write failed for action "${entry.action}": ${msg}`);
    }
  }

  /** Filtered, paginated query — used by GET /admin/audit-logs. */
  async query(q: AuditLogListQuery): Promise<AuditLogListDto> {
    const page: number = q.page ?? 1;
    const limit: number = Math.min(q.limit ?? 20, 100);
    const action: string | undefined = q.action;
    const entityType: string | undefined = q.entityType;
    const userId: string | undefined = q.userId;
    const fromStr: string | undefined = q.from;
    const toStr: string | undefined = q.to;

    const where: FindOptionsWhere<AuditLog> = {};
    if (action !== undefined) where.action = action;
    if (entityType !== undefined) where.entityType = entityType;
    if (userId !== undefined) where.userId = userId;

    const from = fromStr !== undefined ? new Date(fromStr) : undefined;
    // A date-only `to` (e.g. "2026-06-30", what the UI's <input type="date"> emits)
    // parses to midnight UTC, which would exclude everything logged during that day.
    // Normalise it to end-of-day so the upper bound is inclusive of the selected date.
    const to =
      toStr !== undefined
        ? new Date(toStr.includes('T') ? toStr : `${toStr}T23:59:59.999Z`)
        : undefined;

    if (from !== undefined && to !== undefined) {
      where.createdAt = Between(from, to);
    } else if (from !== undefined) {
      where.createdAt = MoreThanOrEqual(from);
    } else if (to !== undefined) {
      where.createdAt = LessThanOrEqual(to);
    }

    const [rows, total] = await this.auditLogRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: rows.map(toDto),
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit),
    };
  }
}
