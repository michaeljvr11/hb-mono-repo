import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { Login } from './login';
import { AuthService } from '../../core/auth/auth.service';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let authService: { login: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = { login: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not call the API while the form is invalid', () => {
    component.submit();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('submits credentials and navigates on success', () => {
    authService.login.mockReturnValue(
      of({ access_token: 'token', user: { id: '1', email: 'a@b.com', role: 'customer' } }),
    );
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component.loginForm.setValue({ email: 'a@b.com', password: 'password1', rememberMe: false });
    component.submit();

    expect(authService.login).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password1',
      rememberMe: false,
    });
    expect(navigate).toHaveBeenCalledWith('/shop');
  });

  it('passes the remember-me choice through to the API', () => {
    authService.login.mockReturnValue(
      of({ access_token: 'token', user: { id: '1', email: 'a@b.com', role: 'customer' } }),
    );
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    component.loginForm.setValue({ email: 'a@b.com', password: 'password1', rememberMe: true });
    component.submit();

    expect(authService.login).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password1',
      rememberMe: true,
    });
  });

  it('surfaces a server error message on failure', () => {
    authService.login.mockReturnValue(
      throwError(() => ({ error: { message: 'Invalid credentials' } })),
    );

    component.loginForm.setValue({ email: 'a@b.com', password: 'password1', rememberMe: false });
    component.submit();

    expect(component.errorMessage()).toBe('Invalid credentials');
  });
});
