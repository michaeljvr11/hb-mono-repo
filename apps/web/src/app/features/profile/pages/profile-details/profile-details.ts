import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { UpdateProfileRequest, UserDto } from '@hb/shared';
import { AuthService } from '../../../../core/auth/auth.service';
import { ProfileService } from '../../../../core/api/profile.service';

/** Delay (ms) between showing the "password changed" message and forcing sign-out,
 *  so the user has a moment to read why they're being logged out. */
const LOGOUT_DELAY_MS = 1800;

@Component({
  selector: 'app-profile-details',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './profile-details.html',
  styleUrl: './profile-details.scss',
})
export class ProfileDetails implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly formBuilder = inject(FormBuilder);

  readonly user = signal<UserDto | null>(null);
  readonly loadingUser = signal(true);
  readonly userLoadError = signal('');

  readonly detailsForm = this.formBuilder.nonNullable.group({
    firstName: [''],
    lastName: [''],
  });
  readonly detailsSubmitting = signal(false);
  readonly detailsSuccess = signal('');
  readonly detailsError = signal('');

  readonly passwordForm = this.formBuilder.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });
  readonly passwordSubmitting = signal(false);
  readonly passwordSuccess = signal('');
  readonly passwordError = signal('');

  get firstNameControl() {
    return this.detailsForm.controls.firstName;
  }

  get lastNameControl() {
    return this.detailsForm.controls.lastName;
  }

  get currentPasswordControl() {
    return this.passwordForm.controls.currentPassword;
  }

  get newPasswordControl() {
    return this.passwordForm.controls.newPassword;
  }

  ngOnInit(): void {
    this.profileService.getMe().subscribe({
      next: (user) => {
        this.user.set(user);
        this.detailsForm.patchValue({
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
        });
        this.loadingUser.set(false);
      },
      error: () => {
        this.userLoadError.set('Could not load your account details. Please refresh.');
        this.loadingUser.set(false);
      },
    });
  }

  saveDetails(): void {
    this.detailsError.set('');
    this.detailsSuccess.set('');

    if (this.detailsForm.invalid) {
      this.detailsForm.markAllAsTouched();
      return;
    }

    const raw = this.detailsForm.getRawValue();
    const payload: UpdateProfileRequest = {
      firstName: raw.firstName,
      lastName: raw.lastName,
    };

    this.detailsSubmitting.set(true);

    this.profileService
      .updateProfile(payload)
      .pipe(finalize(() => this.detailsSubmitting.set(false)))
      .subscribe({
        next: (user) => {
          this.user.set(user);
          this.detailsSuccess.set('Your details have been updated.');
          // Refresh the shared currentUser$ so nav/greeting reflects the new name.
          this.authService.refreshCurrentUser().subscribe({ error: () => undefined });
        },
        error: (err: unknown) => {
          this.detailsError.set(
            this.extractErrorMessage(err) ?? 'Could not save your details. Please try again.',
          );
        },
      });
  }

  changePassword(): void {
    this.passwordError.set('');
    this.passwordSuccess.set('');

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.passwordSubmitting.set(true);

    this.profileService
      .changePassword({ currentPassword, newPassword })
      .pipe(finalize(() => this.passwordSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.passwordForm.reset();
          this.passwordSuccess.set('Password changed — please sign in again.');
          // Every session (including this one) was invalidated server-side —
          // give the user a moment to read the message, then force sign-out.
          setTimeout(() => this.authService.logout(), LOGOUT_DELAY_MS);
        },
        error: (err: unknown) => {
          this.passwordError.set(
            this.extractErrorMessage(err) ?? 'Could not change your password. Please try again.',
          );
        },
      });
  }

  private extractErrorMessage(error: unknown): string | null {
    // NestJS returns `message` as a string (e.g. 400/401) or a string[] for
    // DTO validation failures — normalise both to the first useful line.
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const inner = (error as { error?: { message?: unknown } }).error;
      if (inner && typeof inner.message === 'string') return inner.message;
      if (inner && Array.isArray(inner.message)) return inner.message[0] ?? null;
    }
    return null;
  }
}
