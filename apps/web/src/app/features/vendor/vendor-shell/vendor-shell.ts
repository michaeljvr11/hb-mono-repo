import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  selector: 'app-vendor-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './vendor-shell.html',
  styleUrl: './vendor-shell.scss',
})
export class VendorShell {
  private readonly authService = inject(AuthService);

  /** Signal driving the mobile sidebar drawer open/closed state.
   *  No browser API is read — safe on the server render path. */
  readonly sidebarOpen = signal(false);

  readonly navItems: readonly NavItem[] = [
    { label: 'Dashboard', path: 'dashboard', icon: 'dashboard' },
    { label: 'Earnings',  path: 'earnings',  icon: 'payments' },
    { label: 'Products',  path: 'products',  icon: 'inventory_2' },
    { label: 'Orders',    path: 'orders',    icon: 'shopping_bag' },
    { label: 'Profile',   path: 'profile',   icon: 'person' },
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
