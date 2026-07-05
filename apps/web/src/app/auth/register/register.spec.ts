import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
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
      rememberMe: false,
    });
  });
});

describe('Register returnUrl handling', () => {
  function setup(returnUrl: string | null) {
    const authService = {
      register: vi.fn().mockReturnValue(
        of({ access_token: 'token', user: { id: '1', email: 'a@b.com', role: 'customer' } }),
      ),
    };
    const activatedRoute = {
      snapshot: {
        queryParamMap: { get: (key: string) => (key === 'returnUrl' ? returnUrl : null) },
      },
    };

    TestBed.configureTestingModule({
      imports: [Register],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: ActivatedRoute, useValue: activatedRoute },
      ],
    });

    const fixture = TestBed.createComponent(Register);
    const component = fixture.componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    return { component, navigate };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('navigates to a safe same-app returnUrl after registering', () => {
    const { component, navigate } = setup('/vendor/dashboard');
    component.registerForm.setValue({
      fullName: 'Avery Smith',
      email: 'a@b.com',
      password: 'password1',
      rememberMe: false,
    });
    component.submit();
    expect(navigate).toHaveBeenCalledWith('/vendor/dashboard');
  });

  it('ignores an external returnUrl and falls back to the default destination', () => {
    const { component, navigate } = setup('https://evil.com');
    component.registerForm.setValue({
      fullName: 'Avery Smith',
      email: 'a@b.com',
      password: 'password1',
      rememberMe: false,
    });
    component.submit();
    expect(navigate).toHaveBeenCalledWith('/shop');
  });
});
