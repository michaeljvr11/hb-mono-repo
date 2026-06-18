import { Component, afterNextRender, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-auth-callback',
  imports: [RouterLink],
  templateUrl: './auth-callback.html',
  styleUrl: './auth-callback.scss',
})
export class AuthCallback {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly failed = signal(false);

  constructor() {
    // Browser-only: the refresh cookie set by /auth/google/callback isn't present
    // during SSR, so exchange it for an access token once we're in the browser.
    afterNextRender(() => this.completeSignIn());
  }

  private completeSignIn(): void {
    this.authService.refresh().subscribe({
      next: () => void this.router.navigateByUrl('/shop'),
      error: () => this.failed.set(true),
    });
  }
}
