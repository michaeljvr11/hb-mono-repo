import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser, UserDto, UserRole } from '@hb/shared';

import { NavBar } from './nav-bar';
import { AuthService } from '../../core/auth/auth.service';

describe('NavBar', () => {
  let component: NavBar;
  let fixture: ComponentFixture<NavBar>;
  let userSubject: BehaviorSubject<AuthUser | UserDto | null>;
  let authStub: { currentUser$: BehaviorSubject<AuthUser | UserDto | null>; logout: ReturnType<typeof vi.fn> };

  const jane: AuthUser = {
    id: '1',
    email: 'jane@hb.test',
    role: UserRole.CUSTOMER,
    firstName: 'Jane',
  };

  // Drives the SSR hydration gate: `afterNextRender` flips `hydrated` to true
  // only after the first client render, so we render, let render hooks settle,
  // then re-render to let the real auth state through.
  async function hydrate(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    userSubject = new BehaviorSubject<AuthUser | UserDto | null>(null);
    authStub = { currentUser$: userSubject, logout: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [NavBar],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NavBar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the H&B Market brand', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('H&B Market');
  });

  it('preserves the Sell on H&B entry to /vendor/apply', () => {
    fixture.detectChanges();
    const sell = fixture.nativeElement.querySelector('a.nav-bar__link--sell') as HTMLAnchorElement;
    expect(sell).toBeTruthy();
    expect(sell.getAttribute('href')).toBe('/vendor/apply');
  });

  it('shows a Sign in link and no account/sign-out when anonymous', async () => {
    await hydrate();
    const el: HTMLElement = fixture.nativeElement;
    const signIn = el.querySelector('a.nav-bar__signin') as HTMLAnchorElement;
    expect(signIn).toBeTruthy();
    expect(signIn.getAttribute('href')).toBe('/login');
    expect(signIn.textContent).toContain('Sign in');
    expect(el.querySelector('.nav-bar__signout')).toBeNull();
    expect(el.querySelector('.nav-bar__account')).toBeNull();
  });

  it('shows the account name and a Sign out control when authenticated', async () => {
    userSubject.next(jane);
    await hydrate();
    const el: HTMLElement = fixture.nativeElement;
    const account = el.querySelector('.nav-bar__account');
    expect(account).toBeTruthy();
    expect(account?.textContent).toContain('Jane');
    expect(el.querySelector('.nav-bar__signout')?.textContent).toContain('Sign out');
    expect(el.querySelector('a.nav-bar__signin')).toBeNull();
  });

  it('falls back to the email when the user has no first name', async () => {
    userSubject.next({ id: '2', email: 'no-name@hb.test', role: UserRole.CUSTOMER });
    await hydrate();
    const account = fixture.nativeElement.querySelector('.nav-bar__account');
    expect(account?.textContent).toContain('no-name@hb.test');
  });

  it('switches reactively between anonymous and authenticated', async () => {
    await hydrate();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a.nav-bar__signin')).toBeTruthy();

    userSubject.next(jane);
    fixture.detectChanges();
    expect(el.querySelector('.nav-bar__account')).toBeTruthy();
    expect(el.querySelector('a.nav-bar__signin')).toBeNull();

    userSubject.next(null);
    fixture.detectChanges();
    expect(el.querySelector('a.nav-bar__signin')).toBeTruthy();
    expect(el.querySelector('.nav-bar__account')).toBeNull();
  });

  it('signs out via AuthService.logout()', async () => {
    userSubject.next(jane);
    await hydrate();
    const button = fixture.nativeElement.querySelector('.nav-bar__signout') as HTMLButtonElement;
    button.click();
    expect(authStub.logout).toHaveBeenCalledTimes(1);
  });

  it('routes an anonymous cart click to /login with the current returnUrl', async () => {
    await hydrate();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const cart = fixture.nativeElement.querySelector('.nav-bar__cart-btn') as HTMLButtonElement;
    cart.click();

    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: router.url },
    });
  });

  it('does not navigate on cart click when authenticated', async () => {
    userSubject.next(jane);
    await hydrate();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onCartClick();

    expect(navigate).not.toHaveBeenCalled();
  });
});
