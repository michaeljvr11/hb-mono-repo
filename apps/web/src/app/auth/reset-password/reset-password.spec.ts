import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ResetPassword } from './reset-password';
import { AuthService } from '../../core/auth/auth.service';

describe('ResetPassword', () => {
  let authService: { resetPassword: ReturnType<typeof vi.fn> };

  async function create(token: string | null) {
    authService = { resetPassword: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ResetPassword],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ResetPassword);
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('should create', async () => {
    const component = await create('reset-tok');
    expect(component).toBeTruthy();
  });

  it('blocks submit when the token is missing', async () => {
    const component = await create(null);
    component.resetForm.setValue({ password: 'password1', confirmPassword: 'password1' });
    component.submit();

    expect(authService.resetPassword).not.toHaveBeenCalled();
    expect(component.errorMessage()).not.toBe('');
  });

  it('does not submit when the passwords do not match', async () => {
    const component = await create('reset-tok');
    component.resetForm.setValue({ password: 'password1', confirmPassword: 'password2' });
    component.submit();

    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it('resets the password and flips to the done state on success', async () => {
    const component = await create('reset-tok');
    authService.resetPassword.mockReturnValue(of({ message: 'done' }));

    component.resetForm.setValue({ password: 'password1', confirmPassword: 'password1' });
    component.submit();

    expect(authService.resetPassword).toHaveBeenCalledWith('reset-tok', 'password1');
    expect(component.done()).toBe(true);
  });

  it('surfaces the server error message on failure', async () => {
    const component = await create('reset-tok');
    authService.resetPassword.mockReturnValue(
      throwError(() => ({ error: { message: 'This password reset link is invalid or has expired.' } })),
    );

    component.resetForm.setValue({ password: 'password1', confirmPassword: 'password1' });
    component.submit();

    expect(component.errorMessage()).toBe('This password reset link is invalid or has expired.');
    expect(component.done()).toBe(false);
  });
});
