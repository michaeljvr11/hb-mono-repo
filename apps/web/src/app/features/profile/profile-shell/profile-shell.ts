import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  selector: 'app-profile-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './profile-shell.html',
  styleUrl: './profile-shell.scss',
})
export class ProfileShell {
  private readonly authService = inject(AuthService);

  /** Signal driving the mobile sidebar drawer open/closed state.
   *  No browser API is read — safe on the server render path. */
  readonly sidebarOpen = signal(false);

  readonly navItems: readonly NavItem[] = [
    { label: 'Details',   path: 'details',   icon: 'person' },
    { label: 'Orders',    path: 'orders',    icon: 'shopping_bag' },
    { label: 'Addresses', path: 'addresses', icon: 'home' },
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
