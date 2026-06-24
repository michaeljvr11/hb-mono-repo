import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { sanitizeReturnUrl } from '../../core/auth/return-url';
import { environment } from '../../../environments/environment';
import { RegisterRequest, UserRole } from '@hb/shared';

@Component({
  selector: 'app-register',
  imports: [MatSnackBarModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly showPassword = signal(false);
  // Full-page redirect into the server-side Google OAuth flow.
  readonly googleAuthUrl = `${environment.apiBaseUrl}/auth/google`;
  readonly returnUrl = computed(
    () => sanitizeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')) ?? '',
  );
  readonly loginLinkParams = computed(() =>
    this.returnUrl() ? { returnUrl: this.returnUrl() } : {},
  );

  readonly registerForm = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    rememberMe: [false],
  });

  get fullNameControl() {
    return this.registerForm.controls.fullName;
  }

  get emailControl() {
    return this.registerForm.controls.email;
  }

  get passwordControl() {
    return this.registerForm.controls.password;
  }

  togglePassword(): void {
    this.showPassword.update((shown) => !shown);
  }

  submit(): void {
    this.errorMessage.set('');

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const data: RegisterRequest = {
      ...this.splitFullName(this.registerForm.controls.fullName.value),
      email: this.registerForm.controls.email.value,
      password: this.registerForm.controls.password.value,
      role: UserRole.CUSTOMER,
      rememberMe: this.registerForm.controls.rememberMe.value,
    };

    this.isSubmitting.set(true);

    this.authService
      .register(data)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.showSuccessMessage('Your H&B account is ready. Welcome in.');
          void this.router.navigateByUrl(this.returnUrl() || '/shop');
        },
        error: (error) =>
          this.errorMessage.set(
            this.getErrorMessage(error, 'We could not create your account yet. Please try again.'),
          ),
      });
  }

  // The design captures a single "Full Name"; the API contract keeps optional
  // firstName/lastName. Split on the first space so both stay populated.
  private splitFullName(fullName: string): Pick<RegisterRequest, 'firstName' | 'lastName'> {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const [firstName, ...rest] = parts;
    const lastName = rest.join(' ');
    return lastName ? { firstName, lastName } : { firstName };
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
    // NestJS returns `message` as a string (e.g. 400/409) or a string[] for
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
