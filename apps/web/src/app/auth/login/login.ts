import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { sanitizeReturnUrl } from '../../core/auth/return-url';
import { environment } from '../../../environments/environment';
import { AuthResponse, LoginRequest, UserRole } from '@hb/shared';

@Component({
  selector: 'app-login',
  imports: [MatSnackBarModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly currentYear = new Date().getFullYear();
  // Full-page redirect into the server-side Google OAuth flow.
  readonly googleAuthUrl = `${environment.apiBaseUrl}/auth/google`;
  readonly returnUrl = computed(
    () => sanitizeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')) ?? '',
  );
  readonly registerLinkParams = computed(() =>
    this.returnUrl() ? { returnUrl: this.returnUrl() } : {},
  );

  readonly loginForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    rememberMe: [false],
  });

  get emailControl() {
    return this.loginForm.controls.email;
  }

  get passwordControl() {
    return this.loginForm.controls.password;
  }

  submit(): void {
    this.errorMessage.set('');

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const credentials: LoginRequest = {
      email: this.loginForm.controls.email.value,
      password: this.loginForm.controls.password.value,
      rememberMe: this.loginForm.controls.rememberMe.value,
    };

    this.isSubmitting.set(true);

    this.authService
      .login(credentials)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (response: AuthResponse) => {
          this.showSuccessMessage('Welcome back. Your H&B session is ready.');
          const defaultUrl = response.user.role === UserRole.ADMIN ? '/admin/dashboard' : '/shop';
          void this.router.navigateByUrl(this.returnUrl() || defaultUrl);
        },
        error: (error) =>
          this.errorMessage.set(
            this.getErrorMessage(error, 'We could not sign you in. Check your details and try again.'),
          ),
      });
  }

  // Password reset and Google sign-in are not built yet (see Auth & Roles note).
  // Surface an honest "coming soon" message instead of wiring a fake flow.
  notifyComingSoon(feature: string): void {
    this.snackBar.open(`${feature} is coming soon.`, 'Close', {
      duration: 4000,
      horizontalPosition: 'end',
      panelClass: ['hb-info-snackbar'],
      verticalPosition: 'top',
    });
  }

  private showSuccessMessage(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      horizontalPosition: 'end',
      panelClass: ['hb-success-snackbar'],
      verticalPosition: 'top',
    });
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    // NestJS returns `message` as a string (e.g. 401/409) or a string[] for
    // DTO validation failures — normalise both to the first useful line.
    const message = this.extractMessage(error);
    if (Array.isArray(message)) {
      return message[0] ?? fallback;
    }
    return message ?? fallback;
  }

  private extractMessage(error: unknown): string | string[] | undefined {
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const inner = (error as { error?: { message?: unknown } }).error;
      if (inner && (typeof inner.message === 'string' || Array.isArray(inner.message))) {
        return inner.message as string | string[];
      }
    }
    return undefined;
  }
}
