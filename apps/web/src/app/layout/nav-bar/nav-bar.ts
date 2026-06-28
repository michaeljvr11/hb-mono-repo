import {
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-nav-bar',
  imports: [RouterLink, RouterLinkActive, MatSnackBarModule],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
})
export class NavBar {
  private readonly snackBar = inject(MatSnackBar);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Raw signal from the auth observable — always starts null (safe for SSR).
  private readonly user = toSignal(this.authService.currentUser$, {
    initialValue: null,
  });

  // Hydration gate: both the server render and the initial client hydration
  // pass must see the anonymous state to avoid a DOM mismatch. After the first
  // client render completes we flip this to true and let the real auth state
  // through.
  private readonly hydrated = signal(false);

  readonly currentUser = computed(() => (this.hydrated() ? this.user() : null));
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly accountLabel = computed(() => {
    const u = this.currentUser();
    return u ? (u.firstName?.trim() || u.email || '') : '';
  });

  constructor() {
    afterNextRender(() => this.hydrated.set(true));
  }

  notifyComingSoon(feature: string): void {
    this.snackBar.open(`${feature} is coming soon.`, 'Close', {
      duration: 4000,
      horizontalPosition: 'end',
      panelClass: ['hb-info-snackbar'],
      verticalPosition: 'top',
    });
  }

  onCartClick(): void {
    if (this.isAuthenticated()) {
      this.notifyComingSoon('Cart');
      return;
    }
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }

  signOut(): void {
    this.authService.logout();
  }
}
