import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.scss',
})
export class AdminShell {
  private readonly authService = inject(AuthService);

  /** Signal driving the mobile sidebar drawer open/closed state.
   *  No browser API is read — safe on the server render path. */
  readonly sidebarOpen = signal(false);

  readonly navItems: readonly NavItem[] = [
    { label: 'Dashboard', path: 'dashboard', icon: 'dashboard' },
    { label: 'Vendors',   path: 'vendors',   icon: 'storefront' },
    { label: 'Catalog',   path: 'catalog',   icon: 'inventory_2' },
    { label: 'Users',     path: 'users',     icon: 'group' },
    { label: 'Orders',    path: 'orders',    icon: 'shopping_bag' },
    { label: 'Logs',      path: 'logs',      icon: 'receipt_long' },
  ] as const;

  toggleSidebar(): void {
    this.sidebarOpen.update(open => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  signOut(): void {
    this.authService.logout();
  }
}
