import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AuditLogDto, AuditLogListDto, AuditLogListQuery } from '@hb/shared';
import { AuditService } from '../../../../core/api/audit.service';

type EntityTypeFilter = 'all' | 'vendor' | 'user' | 'product' | 'order';

@Component({
  selector: 'app-admin-logs',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './admin-logs.html',
  styleUrl: './admin-logs.scss',
})
export class AdminLogs implements OnInit {
  private readonly auditService = inject(AuditService);

  readonly result = signal<AuditLogListDto>({
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    pageCount: 1,
  });
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Filter: exact action key (dot-notation, e.g. vendor.status_changed). */
  readonly actionFilter = signal<string>('');

  /** Filter: entity type select. */
  readonly entityTypeFilter = signal<EntityTypeFilter>('all');

  /** Filter: optional user UUID. */
  readonly userIdFilter = signal<string>('');

  /** Filter: ISO date string lower bound. */
  readonly fromFilter = signal<string>('');

  /** Filter: ISO date string upper bound. */
  readonly toFilter = signal<string>('');

  /** Current page (1-based). */
  readonly page = signal(1);

  /** Currently expanded log id (for metadata preview). */
  readonly expandedId = signal<string | null>(null);

  /** Derived expanded log entry. */
  readonly expandedLog = computed<AuditLogDto | null>(() => {
    const id = this.expandedId();
    if (!id) return null;
    return this.result().items.find(l => l.id === id) ?? null;
  });

  readonly isPrevDisabled = computed(() => this.page() <= 1);
  readonly isNextDisabled = computed(() => this.page() >= this.result().pageCount);

  readonly entityTypeOptions: { label: string; value: EntityTypeFilter }[] = [
    { label: 'All types',  value: 'all' },
    { label: 'Vendor',    value: 'vendor' },
    { label: 'User',      value: 'user' },
    { label: 'Product',   value: 'product' },
    { label: 'Order',     value: 'order' },
  ];

  ngOnInit(): void {
    this.fetchLogs();
  }

  private fetchLogs(): void {
    this.loading.set(true);
    this.error.set(null);

    const action = this.actionFilter().trim();
    const entityType = this.entityTypeFilter();
    const userId = this.userIdFilter().trim();
    const from = this.fromFilter().trim();
    const to = this.toFilter().trim();

    const query: AuditLogListQuery = {
      ...(action ? { action } : {}),
      ...(entityType !== 'all' ? { entityType } : {}),
      ...(userId ? { userId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      page: this.page(),
      limit: 20,
    };

    this.auditService.list(query).subscribe({
      next: (data) => {
        this.result.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load audit logs. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  applyFilters(): void {
    this.page.set(1);
    this.expandedId.set(null);
    this.fetchLogs();
  }

  clearFilters(): void {
    this.actionFilter.set('');
    this.entityTypeFilter.set('all');
    this.userIdFilter.set('');
    this.fromFilter.set('');
    this.toFilter.set('');
    this.page.set(1);
    this.expandedId.set(null);
    this.fetchLogs();
  }

  onEntityTypeChange(event: Event): void {
    this.entityTypeFilter.set((event.target as HTMLSelectElement).value as EntityTypeFilter);
  }

  onActionInput(event: Event): void {
    this.actionFilter.set((event.target as HTMLInputElement).value);
  }

  onUserIdInput(event: Event): void {
    this.userIdFilter.set((event.target as HTMLInputElement).value);
  }

  onFromInput(event: Event): void {
    this.fromFilter.set((event.target as HTMLInputElement).value);
  }

  onToInput(event: Event): void {
    this.toFilter.set((event.target as HTMLInputElement).value);
  }

  toggleExpand(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  goToPrev(): void {
    if (this.isPrevDisabled()) return;
    this.page.update(p => p - 1);
    this.expandedId.set(null);
    this.fetchLogs();
  }

  goToNext(): void {
    if (this.isNextDisabled()) return;
    this.page.update(p => p + 1);
    this.expandedId.set(null);
    this.fetchLogs();
  }

  /** Short 8-char prefix of a UUID for display. */
  shortId(id: string): string {
    return id.slice(0, 8);
  }

  /** Compact JSON of metadata for inline display. */
  metadataSummary(entry: AuditLogDto): string {
    if (!entry.metadata) return '';
    return JSON.stringify(entry.metadata);
  }

  /** True when the entry has non-null metadata. */
  hasMetadata(entry: AuditLogDto): boolean {
    return entry.metadata != null && Object.keys(entry.metadata).length > 0;
  }
}
