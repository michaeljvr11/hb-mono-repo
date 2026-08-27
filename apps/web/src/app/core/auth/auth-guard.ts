import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from './auth.service';

/** Where an account with no terms-acceptance record is held (LC-9). */
export const ACCEPT_TERMS_PATH = '/accept-terms';

export const authGuard: CanActivateFn = (_route, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentUser$.pipe(
    take(1),
    map(user => {
      if (!user) {
        return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
      }

      // LC-9: a Google sign-in creates the account without ever showing a
      // consent checkbox, so it lands here with a null acceptance record. Hold
      // it at the interstitial until acceptance is actually recorded — the
      // account exists, but nothing behind the auth boundary is usable.
      //
      // `termsAcceptedAt` is null (never absent) on both shapes currentUser$
      // can hold, so a missing key is a contract bug, not "accepted".
      //
      // Scope, stated plainly: this is a router gate. It closes the web app,
      // not the API — a caller holding a valid access token can still reach
      // the API without an acceptance record. Server-side enforcement was out
      // of scope for LC-9; see the decision comment on the card.
      if (!user.termsAcceptedAt && !state.url.startsWith(ACCEPT_TERMS_PATH)) {
        return router.createUrlTree([ACCEPT_TERMS_PATH], {
          queryParams: { returnUrl: state.url },
        });
      }

      return true;
    }),
  );
};
