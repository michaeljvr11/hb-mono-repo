import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly done = signal(false);
  readonly showPassword = signal(false);
  readonly token = computed(() => this.route.snapshot.queryParamMap.get('token') ?? '');

  readonly resetForm = this.formBuilder.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  get passwordControl() {
    return this.resetForm.controls.password;
  }

  get confirmControl() {
    return this.resetForm.controls.confirmPassword;
  }

  togglePassword(): void {
    this.showPassword.update((shown) => !shown);
  }

  submit(): void {
    this.errorMessage.set('');

    if (!this.token()) {
      this.errorMessage.set('This reset link is missing its token. Please request a new one.');
      return;
    }

    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    this.authService
      .resetPassword(this.token(), this.resetForm.controls.password.value)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => this.done.set(true),
        error: (error) => this.errorMessage.set(this.extractMessage(error)),
      });
  }

  private extractMessage(error: unknown): string {
    const fallback = 'We could not reset your password. The link may have expired.';
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const inner = (error as { error?: { message?: unknown } }).error;
      if (inner && typeof inner.message === 'string') {
        return inner.message;
      }
      if (inner && Array.isArray(inner.message)) {
        return (inner.message[0] as string) ?? fallback;
      }
    }
    return fallback;
  }
}
