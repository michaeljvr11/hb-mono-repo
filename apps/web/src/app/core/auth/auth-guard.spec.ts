import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot, UrlTree } from '@angular/router';
import { lastValueFrom, of, Observable } from 'rxjs';

import { authGuard } from './auth-guard';
import { AuthService } from './auth.service';

/** Run authGuard for a given attempted URL + auth state, normalising the result to a value. */
async function runGuard(
  attemptedUrl: string,
  user: { id: string; email: string; role: string } | null,
): Promise<boolean | UrlTree> {
  const authService = { currentUser$: of(user) };
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: authService }],
  });

  const route = {} as ActivatedRouteSnapshot;
  const state = { url: attemptedUrl } as RouterStateSnapshot;

  const executeGuard: CanActivateFn = (...args) =>
    TestBed.runInInjectionContext(() => authGuard(...args));

  const result = executeGuard(route, state);

  if (result && typeof (result as { subscribe?: unknown }).subscribe === 'function') {
    return lastValueFrom(result as Observable<boolean | UrlTree>);
  }
  return result as boolean | UrlTree;
}

describe('authGuard', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('allows access when a user is logged in', async () => {
    const result = await runGuard('/vendor/dashboard', {
      id: '1',
      email: 'vendor@hb.com',
      role: 'vendor',
    });
    expect(result).toBe(true);
  });

  it('redirects an anonymous user to /login carrying the attempted url as returnUrl', async () => {
    const result = await runGuard('/vendor/dashboard', null);
    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.toString()).toContain('/login');
    expect(tree.queryParams['returnUrl']).toBe('/vendor/dashboard');
  });

  it('preserves query params of the attempted url inside returnUrl', async () => {
    const result = await runGuard('/shop?category=books&page=2', null);
    const tree = result as UrlTree;
    expect(tree.queryParams['returnUrl']).toBe('/shop?category=books&page=2');
  });
});
