import { Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { CountryCode, CreateVendorRequest, VendorDto, VendorStatus } from '@hb/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { VendorsService } from '../../../core/api/vendors.service';

type ScreenState = 'form' | 'pending-confirm' | 'already-applied' | 'vendor-status';

@Component({
  selector: 'app-vendor-onboarding',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './vendor-onboarding.html',
  styleUrl: './vendor-onboarding.scss',
})
export class VendorOnboarding implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly vendorsService = inject(VendorsService);
  private readonly formBuilder = inject(FormBuilder);

  // Expose enum values to the template
  readonly VendorStatus = VendorStatus;
  readonly countryCodes: { value: CountryCode; label: string }[] = [
    { value: CountryCode.SOUTH_AFRICA, label: 'South Africa (ZA)' },
    { value: CountryCode.NAMIBIA, label: 'Namibia (NA)' },
  ];

  readonly currentUser = toSignal(this.authService.currentUser$, { initialValue: null });

  readonly screenState = signal<ScreenState>('form');
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');

  // Vendor status data (for role === 'vendor' mode)
  readonly vendorData = signal<VendorDto | null>(null);
  readonly statusLoading = signal(false);
  readonly statusError = signal('');

  readonly applyForm = this.formBuilder.nonNullable.group({
    businessName: ['', [Validators.required, Validators.maxLength(200)]],
    tradingName: [''],
    registrationNumber: [''],
    countryCode: ['' as CountryCode | ''],
    // requiredTrue, not required: plain `required` is satisfied by `false` on a
    // checkbox, which would let an unticked box through. Same reasoning as the
    // signup consent checkbox (LC-3).
    acceptedTerms: [false, [Validators.requiredTrue]],
  });

  get businessNameControl() {
    return this.applyForm.controls.businessName;
  }

  get acceptedTermsControl() {
    return this.applyForm.controls.acceptedTerms;
  }

  ngOnInit(): void {
    const user = this.currentUser();
    if (user?.role === 'vendor') {
      this.screenState.set('vendor-status');
      this.loadVendorStatus();
    }
  }

  submit(): void {
    this.errorMessage.set('');

    if (this.applyForm.invalid) {
      this.applyForm.markAllAsTouched();
      return;
    }

    if (this.isSubmitting()) {
      return;
    }

    const raw = this.applyForm.getRawValue();
    const payload: CreateVendorRequest = {
      businessName: raw.businessName,
      acceptedTerms: raw.acceptedTerms,
      ...(raw.tradingName ? { tradingName: raw.tradingName } : {}),
      ...(raw.registrationNumber ? { registrationNumber: raw.registrationNumber } : {}),
      ...(raw.countryCode ? { countryCode: raw.countryCode as CountryCode } : {}),
    };

    this.isSubmitting.set(true);

    this.vendorsService
      .create(payload)
      .pipe(
        switchMap(() => this.authService.refreshCurrentUser()),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: () => {
          this.screenState.set('pending-confirm');
        },
        error: (err: unknown) => {
          const status = (err as { status?: number }).status;
          if (status === 409) {
            this.screenState.set('already-applied');
            // Refresh role and fetch status to show current state. Attempt the
            // status load whether or not the refresh succeeds — loadVendorStatus
            // surfaces its own error state if that call also fails.
            this.authService.refreshCurrentUser().subscribe({
              next: () => this.loadVendorStatus(),
              error: () => this.loadVendorStatus(),
            });
          } else {
            this.errorMessage.set(
              this.extractErrorMessage(err) ??
                'Something went wrong. Please try again.',
            );
          }
        },
      });
  }

  private loadVendorStatus(): void {
    this.statusLoading.set(true);
    this.statusError.set('');
    this.vendorsService.getMe().subscribe({
      next: (vendor) => {
        this.vendorData.set(vendor);
        this.statusLoading.set(false);
      },
      error: () => {
        this.statusError.set('Could not load your vendor status. Please refresh.');
        this.statusLoading.set(false);
      },
    });
  }

  private extractErrorMessage(err: unknown): string | null {
    if (typeof err === 'object' && err !== null && 'error' in err) {
      const inner = (err as { error?: { message?: unknown } }).error;
      if (inner && typeof inner.message === 'string') return inner.message;
      if (inner && Array.isArray(inner.message)) return inner.message[0] ?? null;
    }
    return null;
  }
}
