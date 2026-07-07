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
import { CartService } from '../../core/api/cart.service';

@Component({
  selector: 'app-nav-bar',
  imports: [RouterLink, RouterLinkActive, MatSnackBarModule],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
})
export class NavBar {
  private readonly snackBar = inject(MatSnackBar);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
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

  // Real cart badge count — 0 until hydration + first cart load, so the
  // server render and initial client render always match.
  readonly cartCount = computed(() => (this.hydrated() ? this.cartService.itemCount() : 0));

  constructor() {
    afterNextRender(() => {
      this.hydrated.set(true);
      // Prime the badge once per page load for signed-in users; add/update
      // actions elsewhere keep the shared CartService signal fresh.
      if (this.authService.isLoggedIn() && this.cartService.cart() === null) {
        this.cartService.load().subscribe({ error: () => undefined });
      }
    });
  }

  notifyComingSoon(feature: string): void {
    this.snackBar.open(`${feature} is coming soon.`, 'Close', {
      duration: 4000,
      horizontalPosition: 'end',
      panelClass: ['hb-info-snackbar'],
      verticalPosition: 'top',
    });
  }

  onSearchClick(): void {
    void this.router.navigate(['/discover']);
  }

  onCartClick(): void {
    if (this.isAuthenticated()) {
      void this.router.navigate(['/cart']);
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
