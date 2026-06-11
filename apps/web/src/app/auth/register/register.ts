import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { RegisterRequest } from '@hb/shared';

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
  readonly returnUrl = computed(() => this.route.snapshot.queryParamMap.get('returnUrl') ?? '');

  readonly registerForm = this.formBuilder.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(60)]],
    lastName: ['', [Validators.required, Validators.maxLength(60)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    acceptsTerms: [false, [Validators.requiredTrue]],
  });

  get firstNameControl() {
    return this.registerForm.controls.firstName;
  }

  get lastNameControl() {
    return this.registerForm.controls.lastName;
  }

  get emailControl() {
    return this.registerForm.controls.email;
  }

  get passwordControl() {
    return this.registerForm.controls.password;
  }

  get acceptsTermsControl() {
    return this.registerForm.controls.acceptsTerms;
  }

  submit(): void {
    this.errorMessage.set('');

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const data: RegisterRequest = {
      firstName: this.registerForm.controls.firstName.value.trim(),
      lastName: this.registerForm.controls.lastName.value.trim(),
      email: this.registerForm.controls.email.value,
      password: this.registerForm.controls.password.value,
      role: 'customer',
    };

    this.isSubmitting.set(true);

    this.authService.register(data).pipe(
      finalize(() => this.isSubmitting.set(false)),
    ).subscribe({
      next: () => {
        this.showSuccessMessage('Your H&B account is ready. Welcome in.');
        void this.router.navigateByUrl(this.returnUrl() || '/shop');
      },
      error: error => this.errorMessage.set(this.getErrorMessage(error, 'We could not create your account yet. Please try again.')),
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



