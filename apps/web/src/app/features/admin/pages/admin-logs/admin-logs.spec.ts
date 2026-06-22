import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditLogDto, AuditLogListDto } from '@hb/shared';

import { AdminLogs } from './admin-logs';
import { AuditService } from '../../../../core/api/audit.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<AuditLogDto> = {}): AuditLogDto {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    userId: 'uuuuuuuu-0000-0000-0000-000000000001',
    action: 'vendor.status_changed',
    entityType: 'vendor',
    entityId: 'eeeeeeee-0000-0000-0000-000000000001',
    metadata: { from: 'pending', to: 'approved' },
    createdAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

const ENTRY_1 = makeEntry({ id: 'aaaaaaaa-0000-0000-0000-000000000001' });
const ENTRY_2 = makeEntry({
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  userId: null,
  action: 'user.role_assigned',
  entityType: 'user',
  entityId: 'ffffffff-0000-0000-0000-000000000002',
  metadata: null,
  createdAt: '2026-06-02T12:30:00.000Z',
});

function makeResult(overrides: Partial<AuditLogListDto> = {}): AuditLogListDto {
  return {
    items: [ENTRY_1, ENTRY_2],
    total: 2,
    page: 1,
    limit: 20,
    pageCount: 1,
    ...overrides,
  };
}

const EMPTY_RESULT: AuditLogListDto = {
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  pageCount: 1,
};

// ─── Service stub ────────────────────────────────────────────────────────────

interface AuditServiceStub {
  list: ReturnType<typeof vi.fn>;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function createComponent(stub: AuditServiceStub): Promise<{
  component: AdminLogs;
  fixture: ComponentFixture<AdminLogs>;
  nativeEl: HTMLElement;
}> {
  await TestBed.configureTestingModule({
    imports: [AdminLogs],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuditService, useValue: stub },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AdminLogs);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();

  return { component, fixture, nativeEl: fixture.nativeElement as HTMLElement };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AdminLogs component', () => {
  let component: AdminLogs;
  let fixture: ComponentFixture<AdminLogs>;
  let nativeEl: HTMLElement;
  let stub: AuditServiceStub;

  beforeEach(async () => {
    stub = {
      list: vi.fn(() => of(makeResult())),
    };

    ({ component, fixture, nativeEl } = await createComponent(stub));
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('calls list() on init with page 1 and clears loading', () => {
    expect(stub.list).toHaveBeenCalledTimes(1);
    expect(stub.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
    expect(component.loading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('renders log rows when items are present', () => {
    const rows = nativeEl.querySelectorAll('.log-row');
    expect(rows.length).toBe(2);
  });

  it('shows action key in each row', () => {
    const cells = nativeEl.querySelectorAll('.action-key');
    const texts = Array.from(cells).map(c => c.textContent?.trim() ?? '');
    expect(texts.some(t => t === 'vendor.status_changed')).toBe(true);
    expect(texts.some(t => t === 'user.role_assigned')).toBe(true);
  });

  it('shows actor short ID when userId is set', () => {
    const actors = nativeEl.querySelectorAll('.actor-id');
    expect(actors.length).toBeGreaterThan(0);
    expect(actors[0].textContent).toContain('uuuuuuuu');
  });

  it('shows "system" label when userId is null', () => {
    const systemLabels = nativeEl.querySelectorAll('.actor-system');
    expect(systemLabels.length).toBeGreaterThan(0);
    expect(systemLabels[0].textContent?.trim()).toBe('system');
  });

  it('shows entity type pill in each row', () => {
    const pills = nativeEl.querySelectorAll('.entity-type');
    const texts = Array.from(pills).map(p => p.textContent?.trim() ?? '');
    expect(texts.some(t => t === 'vendor')).toBe(true);
    expect(texts.some(t => t === 'user')).toBe(true);
  });

  it('shows metadata toggle only for entries that have metadata', () => {
    // ENTRY_1 has metadata, ENTRY_2 has null metadata
    const toggles = nativeEl.querySelectorAll('.meta-toggle');
    expect(toggles.length).toBe(1);
  });

  it('isPrevDisabled is true on page 1', () => {
    expect(component.page()).toBe(1);
    expect(component.isPrevDisabled()).toBe(true);
  });

  it('isNextDisabled is true when pageCount === 1', () => {
    expect(component.result().pageCount).toBe(1);
    expect(component.isNextDisabled()).toBe(true);
  });

  // ─── Filter: Apply ───────────────────────────────────────────────────────

  it('applyFilters calls list with action param when actionFilter is set', () => {
    stub.list.mockClear();
    stub.list.mockReturnValue(of(makeResult()));

    component.actionFilter.set('vendor.status_changed');
    component.applyFilters();

    expect(stub.list).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'vendor.status_changed', page: 1 }),
    );
  });

  it('applyFilters calls list with entityType param when not "all"', () => {
    stub.list.mockClear();
    stub.list.mockReturnValue(of(makeResult()));

    component.entityTypeFilter.set('vendor');
    component.applyFilters();

    expect(stub.list).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'vendor', page: 1 }),
    );
  });

  it('applyFilters omits entityType when "all" is selected', () => {
    stub.list.mockClear();
    stub.list.mockReturnValue(of(makeResult()));

    component.entityTypeFilter.set('all');
    component.applyFilters();

    const callArg = stub.list.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg['entityType']).toBeUndefined();
  });

  it('applyFilters resets page to 1', () => {
    component['page'].set(3);
    stub.list.mockReturnValue(of(makeResult()));

    component.applyFilters();

    expect(component.page()).toBe(1);
    expect(stub.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('applyFilters includes from and to params when set', () => {
    stub.list.mockClear();
    stub.list.mockReturnValue(of(makeResult()));

    component.fromFilter.set('2026-01-01');
    component.toFilter.set('2026-06-30');
    component.applyFilters();

    expect(stub.list).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-01-01', to: '2026-06-30' }),
    );
  });

  it('applyFilters includes userId when set', () => {
    stub.list.mockClear();
    stub.list.mockReturnValue(of(makeResult()));

    component.userIdFilter.set('some-uuid');
    component.applyFilters();

    expect(stub.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'some-uuid' }),
    );
  });

  // ─── Filter: Clear ───────────────────────────────────────────────────────

  it('clearFilters resets all filter signals and re-queries', () => {
    component.actionFilter.set('vendor.approved');
    component.entityTypeFilter.set('vendor');
    component.userIdFilter.set('u-001');
    component.fromFilter.set('2026-01-01');
    component.toFilter.set('2026-06-30');

    stub.list.mockClear();
    stub.list.mockReturnValue(of(makeResult()));

    component.clearFilters();

    expect(component.actionFilter()).toBe('');
    expect(component.entityTypeFilter()).toBe('all');
    expect(component.userIdFilter()).toBe('');
    expect(component.fromFilter()).toBe('');
    expect(component.toFilter()).toBe('');
    expect(component.page()).toBe(1);
    expect(stub.list).toHaveBeenCalledTimes(1);
    const callArg = stub.list.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg['action']).toBeUndefined();
    expect(callArg['entityType']).toBeUndefined();
  });

  // ─── Pagination ──────────────────────────────────────────────────────────

  it('goToNext increments page and re-queries', () => {
    stub.list.mockReturnValue(of(makeResult({ page: 1, pageCount: 3, total: 60 })));
    component.applyFilters();
    fixture.detectChanges();

    stub.list.mockClear();
    stub.list.mockReturnValue(of(makeResult({ page: 2, pageCount: 3 })));

    component.goToNext();

    expect(stub.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it('goToPrev decrements page and re-queries when not on page 1', () => {
    component['page'].set(2);
    stub.list.mockClear();
    stub.list.mockReturnValue(of(makeResult({ page: 1, pageCount: 3 })));

    component.goToPrev();

    expect(stub.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('goToPrev is a no-op on page 1', () => {
    expect(component.page()).toBe(1);
    stub.list.mockClear();

    component.goToPrev();

    expect(stub.list).not.toHaveBeenCalled();
  });

  it('goToNext is a no-op on the last page', () => {
    expect(component.isNextDisabled()).toBe(true);
    stub.list.mockClear();

    component.goToNext();

    expect(stub.list).not.toHaveBeenCalled();
  });

  // ─── Utility methods ─────────────────────────────────────────────────────

  it('shortId returns the first 8 chars of a UUID', () => {
    expect(component.shortId('aaaaaaaa-0000-0000-0000-000000000001')).toBe('aaaaaaaa');
  });

  it('hasMetadata returns true when metadata is a non-empty object', () => {
    expect(component.hasMetadata(ENTRY_1)).toBe(true);
  });

  it('hasMetadata returns false when metadata is null', () => {
    expect(component.hasMetadata(ENTRY_2)).toBe(false);
  });

  it('metadataSummary returns JSON string for non-null metadata', () => {
    const summary = component.metadataSummary(ENTRY_1);
    expect(summary).toContain('pending');
    expect(summary).toContain('approved');
  });
});

// ─── Empty state ─────────────────────────────────────────────────────────────

describe('AdminLogs — empty state', () => {
  it('shows "No activity logged yet." when items is empty', async () => {
    const stub: AuditServiceStub = {
      list: vi.fn(() => of(EMPTY_RESULT)),
    };

    const { nativeEl } = await createComponent(stub);

    const emptyEl = nativeEl.querySelector('.list-empty');
    expect(emptyEl).not.toBeNull();
    expect(emptyEl!.textContent).toContain('No activity logged yet.');
  });

  it('does not show an error banner for an empty result', async () => {
    const stub: AuditServiceStub = {
      list: vi.fn(() => of(EMPTY_RESULT)),
    };

    const { nativeEl } = await createComponent(stub);

    const errorBanner = nativeEl.querySelector('.error-banner');
    expect(errorBanner).toBeNull();
  });
});

// ─── Error loading path ───────────────────────────────────────────────────────

describe('AdminLogs — load error path', () => {
  it('sets error signal and clears loading when list() fails', async () => {
    const stub: AuditServiceStub = {
      list: vi.fn(() => throwError(() => new Error('500'))),
    };

    const { component } = await createComponent(stub);

    expect(component.loading()).toBe(false);
    expect(component.error()).toBeTruthy();
  });

  it('shows error banner when list() fails', async () => {
    const stub: AuditServiceStub = {
      list: vi.fn(() => throwError(() => new Error('500'))),
    };

    const { nativeEl } = await createComponent(stub);

    const banner = nativeEl.querySelector('.error-banner');
    expect(banner).not.toBeNull();
  });
});
