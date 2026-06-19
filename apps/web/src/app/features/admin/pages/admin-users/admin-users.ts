import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AdminUserDto, UserRole } from '@hb/shared';
import { UsersService } from '../../../../core/api/users.service';

type FilterValue = UserRole | 'all' | 'inactive';

interface FilterTab {
  label: string;
  value: FilterValue;
}

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
})
export class AdminUsers implements OnInit {
  private readonly usersService = inject(UsersService);

  /** Full user list returned from the API. */
  readonly users = signal<AdminUserDto[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Currently selected user id. */
  readonly selectedId = signal<string | null>(null);

  /** In-flight mutation — stores the user id being mutated. */
  readonly pendingId = signal<string | null>(null);

  /** Error message shown inside the detail panel after a failed action. */
  readonly actionError = signal<string | null>(null);

  /** Active filter tab. */
  readonly activeFilter = signal<FilterValue>('all');

  /** Search query for client-side filtering. */
  readonly searchQuery = signal<string>('');

  readonly filterTabs: FilterTab[] = [
    { label: 'All',      value: 'all' },
    { label: 'Customer', value: UserRole.CUSTOMER },
    { label: 'Vendor',   value: UserRole.VENDOR },
    { label: 'Admin',    value: UserRole.ADMIN },
    { label: 'Inactive', value: 'inactive' },
  ];

  /** All three role values, used in the role <select>. */
  readonly roles: UserRole[] = [UserRole.CUSTOMER, UserRole.VENDOR, UserRole.ADMIN];

  /** Derived filtered + searched list. */
  readonly filteredUsers = computed<AdminUserDto[]>(() => {
    const filter = this.activeFilter();
    const query = this.searchQuery().trim().toLowerCase();
    let list = this.users();

    // Apply tab filter.
    if (filter === 'inactive') {
      list = list.filter(u => !u.isActive);
    } else if (filter !== 'all') {
      list = list.filter(u => u.role === filter);
    }

    // Apply search query (email, firstName, lastName, name).
    if (query) {
      list = list.filter(u =>
        u.email.toLowerCase().includes(query) ||
        (u.firstName?.toLowerCase().includes(query) ?? false) ||
        (u.lastName?.toLowerCase().includes(query) ?? false) ||
        (u.name?.toLowerCase().includes(query) ?? false),
      );
    }

    return list;
  });

  /** Derived selected user object. */
  readonly selectedUser = computed<AdminUserDto | null>(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.users().find(u => u.id === id) ?? null;
  });

  ngOnInit(): void {
    this.usersService.listUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load users. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  setFilter(value: FilterValue): void {
    this.activeFilter.set(value);
    // Clear selection when filter changes so the detail panel resets.
    this.selectedId.set(null);
    this.actionError.set(null);
  }

  selectUser(id: string): void {
    this.selectedId.set(id);
    this.actionError.set(null);
  }

  countFor(filter: FilterValue): number {
    const list = this.users();
    if (filter === 'all') return list.length;
    if (filter === 'inactive') return list.filter(u => !u.isActive).length;
    return list.filter(u => u.role === filter).length;
  }

  displayName(user: AdminUserDto): string {
    return user.name ?? user.email;
  }

  onRoleChange(userId: string, event: Event): void {
    if (this.pendingId() !== null) return;
    const role = (event.target as HTMLSelectElement).value as UserRole;
    this.pendingId.set(userId);
    this.actionError.set(null);

    this.usersService.updateUserRole(userId, { role }).subscribe({
      next: (updated) => {
        this.users.update(list =>
          list.map(u => (u.id === userId ? { ...u, role: updated.role } : u)),
        );
        this.pendingId.set(null);
      },
      error: () => {
        this.actionError.set('Role update failed. Please try again.');
        this.pendingId.set(null);
      },
    });
  }

  onToggleActive(userId: string, currentIsActive: boolean): void {
    if (this.pendingId() !== null) return;
    this.pendingId.set(userId);
    this.actionError.set(null);

    this.usersService.setUserActive(userId, { isActive: !currentIsActive }).subscribe({
      next: (updated) => {
        this.users.update(list =>
          list.map(u => (u.id === userId ? { ...u, isActive: updated.isActive } : u)),
        );
        this.pendingId.set(null);
      },
      error: () => {
        this.actionError.set('Status update failed. Please try again.');
        this.pendingId.set(null);
      },
    });
  }
}
