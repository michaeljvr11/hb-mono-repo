import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot, UrlTree } from '@angular/router';
import { lastValueFrom, of, Observable } from 'rxjs';

import { authGuard } from './auth-guard';
import { AuthService } from './auth.service';

type GuardUser = {
  id: string;
  email: string;
  role: string;
  termsAcceptedAt?: string | null;
};

/** An account that has accepted the terms — the ordinary case. */
const ACCEPTED = '2026-08-20T09:00:00.000Z';

/** Run authGuard for a given attempted URL + auth state, normalising the result to a value. */
async function runGuard(
  attemptedUrl: string,
  user: GuardUser | null,
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
      termsAcceptedAt: ACCEPTED,
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

  // ── LC-9: the terms gate ────────────────────────────────────────────────

  it('holds an account with no acceptance record at the interstitial', async () => {
    const result = await runGuard('/checkout', {
      id: '1',
      email: 'oauth@hb.com',
      role: 'customer',
      termsAcceptedAt: null,
    });

    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.toString()).toContain('/accept-terms');
    expect(tree.queryParams['returnUrl']).toBe('/checkout');
  });

  // A missing key is a contract bug, not consent — it must fail closed.
  it('treats an absent termsAcceptedAt as not accepted', async () => {
    const result = await runGuard('/cart', {
      id: '1',
      email: 'oauth@hb.com',
      role: 'customer',
    });

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('/accept-terms');
  });

  it('lets an unaccepted account reach the interstitial itself, so it cannot loop', async () => {
    const result = await runGuard('/accept-terms', {
      id: '1',
      email: 'oauth@hb.com',
      role: 'customer',
      termsAcceptedAt: null,
    });

    expect(result).toBe(true);
  });

  it('sends an anonymous visitor to /login, not to the terms gate', async () => {
    const result = await runGuard('/checkout', null);
    expect((result as UrlTree).toString()).toContain('/login');
  });

  it('preserves query params of the attempted url inside returnUrl', async () => {
    const result = await runGuard('/shop?category=books&page=2', null);
    const tree = result as UrlTree;
    expect(tree.queryParams['returnUrl']).toBe('/shop?category=books&page=2');
  });
});
