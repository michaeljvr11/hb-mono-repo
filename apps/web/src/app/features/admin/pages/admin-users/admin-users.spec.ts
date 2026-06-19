import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError, NEVER } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminUserDto, UserRole } from '@hb/shared';

import { AdminUsers } from './admin-users';
import { UsersService } from '../../../../core/api/users.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_USERS: AdminUserDto[] = [
  {
    id: 'u1',
    email: 'admin@hb.com',
    role: UserRole.ADMIN,
    isActive: true,
    isVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'u2',
    email: 'vendor@hb.com',
    firstName: 'Jane',
    lastName: 'Doe',
    name: 'Jane Doe',
    role: UserRole.VENDOR,
    isActive: true,
    isVerified: false,
    createdAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'u3',
    email: 'customer@hb.com',
    role: UserRole.CUSTOMER,
    isActive: true,
    isVerified: true,
    createdAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 'u4',
    email: 'inactive@hb.com',
    role: UserRole.CUSTOMER,
    isActive: false,
    isVerified: false,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
];

// ─── Stub shape ──────────────────────────────────────────────────────────────

interface UsersServiceStub {
  listUsers: ReturnType<typeof vi.fn>;
  updateUserRole: ReturnType<typeof vi.fn>;
  setUserActive: ReturnType<typeof vi.fn>;
}

// ─── Component integration tests ─────────────────────────────────────────────

describe('AdminUsers component', () => {
  let component: AdminUsers;
  let fixture: ComponentFixture<AdminUsers>;
  let stub: UsersServiceStub;

  beforeEach(async () => {
    stub = {
      listUsers: vi.fn(() => of([...MOCK_USERS])),
      updateUserRole: vi.fn(),
      setUserActive: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminUsers],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: UsersService, useValue: stub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminUsers);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads users on init and clears loading flag', () => {
    expect(stub.listUsers).toHaveBeenCalledTimes(1);
    expect(component.loading()).toBe(false);
    expect(component.users().length).toBe(4);
  });

  it('activeFilter defaults to "all" and filteredUsers returns all 4', () => {
    expect(component.activeFilter()).toBe('all');
    expect(component.filteredUsers().length).toBe(4);
  });

  it('setFilter(ADMIN) returns only the admin user', () => {
    component.setFilter(UserRole.ADMIN);
    const filtered = component.filteredUsers();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('u1');
  });

  it('setFilter(VENDOR) returns only the vendor user', () => {
    component.setFilter(UserRole.VENDOR);
    const filtered = component.filteredUsers();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('u2');
  });

  it('setFilter(CUSTOMER) returns both customer users (u3 and u4)', () => {
    component.setFilter(UserRole.CUSTOMER);
    const filtered = component.filteredUsers();
    expect(filtered.length).toBe(2);
    const ids = filtered.map(u => u.id);
    expect(ids).toContain('u3');
    expect(ids).toContain('u4');
  });

  it('setFilter("inactive") returns only the inactive user', () => {
    component.setFilter('inactive');
    const filtered = component.filteredUsers();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('u4');
  });

  it('setFilter clears selectedId', () => {
    component.selectUser('u2');
    expect(component.selectedId()).toBe('u2');
    component.setFilter(UserRole.ADMIN);
    expect(component.selectedId()).toBeNull();
  });

  it('selectUser("u2") makes selectedUser return the vendor user', () => {
    component.selectUser('u2');
    expect(component.selectedUser()?.id).toBe('u2');
    expect(component.selectedUser()?.email).toBe('vendor@hb.com');
  });

  it('countFor returns correct counts', () => {
    expect(component.countFor('all')).toBe(4);
    expect(component.countFor(UserRole.ADMIN)).toBe(1);
    expect(component.countFor(UserRole.VENDOR)).toBe(1);
    expect(component.countFor(UserRole.CUSTOMER)).toBe(2);
    expect(component.countFor('inactive')).toBe(1);
  });

  it('displayName returns name when present (u2 → "Jane Doe")', () => {
    const u2 = MOCK_USERS[1];
    expect(component.displayName(u2)).toBe('Jane Doe');
  });

  it('displayName falls back to email when name is absent (u1 → email)', () => {
    const u1 = MOCK_USERS[0];
    expect(component.displayName(u1)).toBe('admin@hb.com');
  });

  it('onRoleChange calls updateUserRole, updates role in signal list, clears pendingId', async () => {
    const updated: AdminUserDto = { ...MOCK_USERS[0], role: UserRole.VENDOR };
    stub.updateUserRole.mockReturnValue(of(updated));

    const event = { target: { value: UserRole.VENDOR } } as unknown as Event;
    component.onRoleChange('u1', event);
    await fixture.whenStable();

    expect(stub.updateUserRole).toHaveBeenCalledWith('u1', { role: UserRole.VENDOR });
    const u1 = component.users().find(u => u.id === 'u1');
    expect(u1?.role).toBe(UserRole.VENDOR);
    expect(component.pendingId()).toBeNull();
  });

  it('onRoleChange while another is in flight is a no-op (updateUserRole not called twice)', () => {
    stub.updateUserRole.mockReturnValueOnce(NEVER);

    const event = { target: { value: UserRole.VENDOR } } as unknown as Event;
    component.onRoleChange('u1', event);
    expect(component.pendingId()).toBe('u1');

    // Second call while first is in flight must be ignored.
    component.onRoleChange('u2', event);
    expect(stub.updateUserRole).toHaveBeenCalledTimes(1);
    expect(component.pendingId()).toBe('u1');
  });

  it('onRoleChange on error sets actionError and clears pendingId', async () => {
    stub.updateUserRole.mockReturnValue(throwError(() => new Error('Network error')));

    const event = { target: { value: UserRole.ADMIN } } as unknown as Event;
    component.onRoleChange('u1', event);
    await fixture.whenStable();

    expect(component.actionError()).toBeTruthy();
    expect(component.pendingId()).toBeNull();
  });

  it('onToggleActive(u1.id, true) calls setUserActive with isActive: false and updates signal list', async () => {
    const updated: AdminUserDto = { ...MOCK_USERS[0], isActive: false };
    stub.setUserActive.mockReturnValue(of(updated));

    component.onToggleActive('u1', true);
    await fixture.whenStable();

    expect(stub.setUserActive).toHaveBeenCalledWith('u1', { isActive: false });
    const u1 = component.users().find(u => u.id === 'u1');
    expect(u1?.isActive).toBe(false);
    expect(component.pendingId()).toBeNull();
  });

  it('onToggleActive on error sets actionError and clears pendingId', async () => {
    stub.setUserActive.mockReturnValue(throwError(() => new Error('Server error')));

    component.onToggleActive('u1', true);
    await fixture.whenStable();

    expect(component.actionError()).toBeTruthy();
    expect(component.pendingId()).toBeNull();
  });

  it('searchQuery filters filteredUsers by partial email match', () => {
    component.searchQuery.set('jane');
    const filtered = component.filteredUsers();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('u2');
  });

  it('searchQuery combined with a role filter narrows results further', () => {
    component.setFilter(UserRole.CUSTOMER);
    component.searchQuery.set('inactive');
    const filtered = component.filteredUsers();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('u4');
  });
});

// ─── Error loading test (isolated setup) ─────────────────────────────────────

describe('AdminUsers — load error path', () => {
  it('sets error signal and clears loading when listUsers() fails', async () => {
    const failStub: UsersServiceStub = {
      listUsers: vi.fn(() => throwError(() => new Error('500'))),
      updateUserRole: vi.fn(),
      setUserActive: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminUsers],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: UsersService, useValue: failStub },
      ],
    }).compileComponents();

    const failFixture = TestBed.createComponent(AdminUsers);
    const failComponent = failFixture.componentInstance;
    failFixture.detectChanges();
    await failFixture.whenStable();

    expect(failComponent.loading()).toBe(false);
    expect(failComponent.error()).toBeTruthy();
  });
});
