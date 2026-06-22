/** Single audit log entry — one write per privileged action.
 *  The audit trail is append-only; records are never modified after creation. */
export interface AuditLogDto {
  id: string;
  /** The user who performed the action, or null for system-initiated events. */
  userId: string | null;
  /** Action key in dot notation, e.g. `vendor.status_changed`. */
  action: string;
  /** Domain entity type the action was performed on, e.g. `vendor`, `user`, `product`. */
  entityType: string;
  /** Database identifier of the affected entity. */
  entityId: string;
  /** Optional structured context about the action (e.g. `{ from: 'pending', to: 'approved' }`). */
  metadata?: Record<string, unknown> | null;
  /** ISO-8601 UTC timestamp of when the action was recorded. */
  createdAt: string;
}

/** Query parameters for the admin audit log list endpoint.
 *  All filters are optional and are combined with AND semantics. */
export interface AuditLogListQuery {
  /** Filter by exact action key (e.g. `vendor.status_changed`). */
  action?: string;
  /** Filter by entity type (e.g. `vendor`, `user`, `product`). */
  entityType?: string;
  /** Filter by the user who performed the action (UUID). */
  userId?: string;
  /** ISO-8601 inclusive lower bound for `createdAt`. */
  from?: string;
  /** ISO-8601 inclusive upper bound for `createdAt`. */
  to?: string;
  /** 1-based page number (default: 1). */
  page?: number;
  /** Page size (default: 20, max: 100). */
  limit?: number;
}

/** Paginated audit log list response. */
export interface AuditLogListDto {
  items: AuditLogDto[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}
