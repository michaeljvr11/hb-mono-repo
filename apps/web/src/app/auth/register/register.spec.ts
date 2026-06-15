import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { Register } from './register';
import { AuthService } from '../../core/auth/auth.service';

describe('Register', () => {
  let component: Register;
  let fixture: ComponentFixture<Register>;
  let authService: { register: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = { register: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Register);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('toggles password visibility', () => {
    expect(component.showPassword()).toBe(false);
    component.togglePassword();
    expect(component.showPassword()).toBe(true);
  });

  it('does not call the API while the form is invalid', () => {
    component.submit();
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('splits a full name into first and last name on submit', () => {
    authService.register.mockReturnValue(
      of({ access_token: 'token', user: { id: '1', email: 'a@b.com', role: 'customer' } }),
    );
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component.registerForm.setValue({
      fullName: 'Avery Mokoena Smith',
      email: 'a@b.com',
      password: 'password1',
      rememberMe: true,
    });
    component.submit();

    expect(authService.register).toHaveBeenCalledWith({
      firstName: 'Avery',
      lastName: 'Mokoena Smith',
      email: 'a@b.com',
      password: 'password1',
      role: 'customer',
      rememberMe: true,
    });
  });

  it('omits last name when only a single name is given', () => {
    authService.register.mockReturnValue(
      of({ access_token: 'token', user: { id: '1', email: 'a@b.com', role: 'customer' } }),
    );
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component.registerForm.setValue({
      fullName: 'Cher',
      email: 'a@b.com',
      password: 'password1',
      rememberMe: false,
    });
    component.submit();

    expect(authService.register).toHaveBeenCalledWith({
      firstName: 'Cher',
      email: 'a@b.com',
      password: 'password1',
      role: 'customer',
      rememberMe: false,
    });
  });
});
