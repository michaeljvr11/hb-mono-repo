import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { vi } from 'vitest';

import { roleGuard } from './role-guard';
import { AuthService } from '../auth.service';

/** Helper: turn the guard result (Observable | boolean | UrlTree) into a plain value. */
async function runGuard(
  routeData: Record<string, unknown>,
  user: { id: string; email: string; role: string } | null,
): Promise<boolean | UrlTree> {
  const authService = { currentUser$: of(user) };
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: authService }],
  });

  const route = { data: routeData } as unknown as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  const executeGuard: CanActivateFn = (...args) =>
    TestBed.runInInjectionContext(() => roleGuard(...args));

  const result = executeGuard(route, state);

  // Guard returns an Observable<boolean | UrlTree>
  if (result && typeof (result as { subscribe?: unknown }).subscribe === 'function') {
    return lastValueFrom(result as import('rxjs').Observable<boolean | UrlTree>);
  }
  return result as boolean | UrlTree;
}

describe('roleGuard', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('allows access when an admin user visits a route requiring admin role', async () => {
    const result = await runGuard(
      { roles: ['admin'] },
      { id: '1', email: 'admin@hb.com', role: 'admin' },
    );
    expect(result).toBe(true);
  });

  it('redirects to /login when a non-admin user visits an admin-only route', async () => {
    const result = await runGuard(
      { roles: ['admin'] },
      { id: '2', email: 'user@hb.com', role: 'customer' },
    );
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('login');
  });

  it('redirects to /login when there is no logged-in user', async () => {
    const result = await runGuard({ roles: ['admin'] }, null);
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('login');
  });

  it('allows access when no roles are specified in route data', async () => {
    const result = await runGuard(
      {},
      { id: '3', email: 'anyone@hb.com', role: 'customer' },
    );
    expect(result).toBe(true);
  });

  it('allows a vendor user to access a vendor-only route', async () => {
    const result = await runGuard(
      { roles: ['vendor'] },
      { id: '4', email: 'vendor@hb.com', role: 'vendor' },
    );
    expect(result).toBe(true);
  });

  it('blocks a customer from a vendor-only route', async () => {
    const result = await runGuard(
      { roles: ['vendor'] },
      { id: '5', email: 'cust@hb.com', role: 'customer' },
    );
    expect(result).toBeInstanceOf(UrlTree);
  });
});
