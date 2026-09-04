import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
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

  it('links the footer Terms of Trade and Privacy Policy to their real routes, not the coming-soon snackbar', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const termsLink = el.querySelector('a[href="/legal/terms"]');
    const privacyLink = el.querySelector('a[href="/legal/privacy"]');
    expect(termsLink?.textContent?.trim()).toBe('Terms of Trade');
    expect(privacyLink?.textContent?.trim()).toBe('Privacy Policy');
  });

  it('routes the brand link to the storefront, not back to /login', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const brandLink = el.querySelector('a.brand');
    expect(brandLink?.getAttribute('href')).toBe('/shop');
  });

  it('renders a Contact link (replacing the old coming-soon Support button) that routes to /contact', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const contactLink = el.querySelector('a.link-button');
    expect(contactLink?.textContent?.trim()).toBe('Contact');
    expect(contactLink?.getAttribute('href')).toBe('/contact');
  });
});

describe('Login returnUrl handling', () => {
  function setup(returnUrl: string | null) {
    const authService = {
      login: vi.fn().mockReturnValue(
        of({ access_token: 'token', user: { id: '1', email: 'a@b.com', role: 'customer' } }),
      ),
    };
    const activatedRoute = {
      snapshot: {
        queryParamMap: { get: (key: string) => (key === 'returnUrl' ? returnUrl : null) },
      },
    };

    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: ActivatedRoute, useValue: activatedRoute },
      ],
    });

    const fixture = TestBed.createComponent(Login);
    const component = fixture.componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    return { component, navigate };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('navigates to a safe same-app returnUrl after login', () => {
    const { component, navigate } = setup('/vendor/dashboard');
    component.loginForm.setValue({ email: 'a@b.com', password: 'password1', rememberMe: false });
    component.submit();
    expect(navigate).toHaveBeenCalledWith('/vendor/dashboard');
  });

  it('ignores an external returnUrl and falls back to the default destination', () => {
    const { component, navigate } = setup('https://evil.com');
    component.loginForm.setValue({ email: 'a@b.com', password: 'password1', rememberMe: false });
    component.submit();
    expect(navigate).toHaveBeenCalledWith('/shop');
  });
});
