import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { LoginRequest } from '@hb/shared';

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
  readonly returnUrl = computed(() => this.route.snapshot.queryParamMap.get('returnUrl') ?? '');

  readonly loginForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    rememberMe: [true],
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
    };

    this.isSubmitting.set(true);

    this.authService.login(credentials).pipe(
      finalize(() => this.isSubmitting.set(false)),
    ).subscribe({
      next: () => {
        this.showSuccessMessage('Welcome back. Your H&B session is ready.');
        void this.router.navigateByUrl(this.returnUrl() || '/shop');
      },
      error: error => this.errorMessage.set(this.getErrorMessage(error, 'We could not sign you in. Check your details and try again.')),
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
    if (this.hasMessage(error)) {
      return error.error.message;
    }

    return fallback;
  }

  private hasMessage(error: unknown): error is { error: { message: string } } {
    return typeof error === 'object'
      && error !== null
      && 'error' in error
      && typeof (error as { error?: { message?: unknown } }).error?.message === 'string';
  }
}



