import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentUser$.pipe(
    take(1),
    map(user =>
      user
        ? true
        : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }),
    ),
  );
};
