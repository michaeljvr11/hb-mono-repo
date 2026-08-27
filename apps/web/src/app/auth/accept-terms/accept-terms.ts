import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { sanitizeReturnUrl } from '../../core/auth/return-url';

/**
 * LC-9 — the consent interstitial a first-time Google sign-in lands on.
 *
 * `AuthService.validateOAuthLogin` creates the account without ever showing a
 * consent checkbox, so the account arrives here with a null acceptance record.
 * `authGuard` holds every authenticated route at this screen until acceptance
 * is recorded server-side.
 *
 * The account already exists and the session is already signed in — this
 * screen does not create anything. It records the acceptance that the OAuth
 * path skipped, or lets the person sign out instead.
 */
@Component({
  selector: 'app-accept-terms',
  imports: [RouterLink],
  templateUrl: './accept-terms.html',
  styleUrl: './accept-terms.scss',
})
export class AcceptTerms {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly currentYear = new Date().getFullYear();

  /** Where the guard bounced them from, sanitised against open-redirects. */
  readonly returnUrl = computed(
    () => sanitizeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')) ?? '/shop',
  );

  accept(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    this.authService
      .acceptTerms()
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl(this.returnUrl());
        },
        // The API deliberately fails rather than reporting an acceptance it
        // could not record, so a failure here must keep the person on this
        // screen rather than waving them through.
        error: () =>
          this.errorMessage.set(
            'We could not record your acceptance. Please try again.',
          ),
      });
  }

  declineAndSignOut(): void {
    this.authService.logout();
  }
}
