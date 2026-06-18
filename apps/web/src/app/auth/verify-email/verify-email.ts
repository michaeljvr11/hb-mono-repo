import { Component, afterNextRender, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

type VerifyState = 'verifying' | 'success' | 'error';

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss',
})
export class VerifyEmail {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<VerifyState>('verifying');
  readonly message = signal('Verifying your email address…');

  constructor() {
    // Browser-only: avoids firing the verify POST during SSR and again on hydration.
    afterNextRender(() => this.verify());
  }

  private verify(): void {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!token) {
      this.state.set('error');
      this.message.set('This verification link is missing its token.');
      return;
    }

    this.authService.verifyEmail(token).subscribe({
      next: (response) => {
        this.state.set('success');
        this.message.set(response.message);
      },
      error: (error) => {
        this.state.set('error');
        this.message.set(this.extractMessage(error));
      },
    });
  }

  private extractMessage(error: unknown): string {
    const fallback = 'This verification link is invalid or has expired.';
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const inner = (error as { error?: { message?: unknown } }).error;
      if (inner && typeof inner.message === 'string') {
        return inner.message;
      }
    }
    return fallback;
  }
}
