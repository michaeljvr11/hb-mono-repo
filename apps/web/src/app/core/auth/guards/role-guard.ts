import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { UserRole } from '@hb/shared';
import { AuthService } from '../auth.service';

export const roleGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const roles = route.data['roles'] as UserRole[] | undefined;

  if (!roles?.length) {
    return true;
  }

  return authService.currentUser$.pipe(
    take(1),
    map(user =>
      user && roles.includes(user.role)
        ? true
        : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }),
    ),
  );
};
