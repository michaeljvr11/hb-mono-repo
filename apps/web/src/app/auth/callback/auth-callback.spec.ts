import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AuthCallback } from './auth-callback';
import { AuthService } from '../../core/auth/auth.service';

describe('AuthCallback', () => {
  let authService: { refresh: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = { refresh: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AuthCallback],
      providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
    }).compileComponents();
  });

  // completeSignIn normally fires on afterNextRender (browser only); call it
  // directly so the test is deterministic without a render pass.
  function runCallback(component: AuthCallback) {
    (component as unknown as { completeSignIn: () => void }).completeSignIn();
  }

  it('should create', () => {
    authService.refresh.mockReturnValue(of({ access_token: 't', user: {} }));
    expect(TestBed.createComponent(AuthCallback).componentInstance).toBeTruthy();
  });

  it('exchanges the cookie and navigates to /shop', () => {
    authService.refresh.mockReturnValue(
      of({ access_token: 't', user: { id: '1', email: 'a@b.com', role: 'customer' } }),
    );
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const component = TestBed.createComponent(AuthCallback).componentInstance;

    runCallback(component);

    expect(authService.refresh).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/shop');
    expect(component.failed()).toBe(false);
  });

  it('shows a failure state when the exchange fails', () => {
    authService.refresh.mockReturnValue(throwError(() => ({ status: 401 })));
    const component = TestBed.createComponent(AuthCallback).componentInstance;

    runCallback(component);

    expect(component.failed()).toBe(true);
  });
});
