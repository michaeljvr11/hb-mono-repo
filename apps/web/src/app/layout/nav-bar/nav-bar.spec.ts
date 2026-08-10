import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser, CartDto, UserDto, UserRole } from '@hb/shared';

import { NavBar } from './nav-bar';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/api/cart.service';

describe('NavBar', () => {
  let component: NavBar;
  let fixture: ComponentFixture<NavBar>;
  let userSubject: BehaviorSubject<AuthUser | UserDto | null>;
  let authStub: {
    currentUser$: BehaviorSubject<AuthUser | UserDto | null>;
    logout: ReturnType<typeof vi.fn>;
    isLoggedIn: ReturnType<typeof vi.fn>;
  };
  let cartSignal: ReturnType<typeof signal<CartDto | null>>;
  let countSignal: ReturnType<typeof signal<number>>;
  let cartStub: {
    cart: ReturnType<typeof signal<CartDto | null>>;
    itemCount: ReturnType<typeof signal<number>>;
    load: ReturnType<typeof vi.fn>;
  };

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
    authStub = {
      currentUser$: userSubject,
      logout: vi.fn(),
      isLoggedIn: vi.fn().mockReturnValue(false),
    };
    cartSignal = signal<CartDto | null>(null);
    countSignal = signal(0);
    cartStub = {
      cart: cartSignal,
      itemCount: countSignal,
      load: vi.fn(() => of({ id: 'c1', items: [], totals: [], itemCount: 0, updatedAt: '' })),
    };

    await TestBed.configureTestingModule({
      imports: [NavBar],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        { provide: CartService, useValue: cartStub },
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

  it('links the account icon to /profile when authenticated', async () => {
    userSubject.next(jane);
    await hydrate();
    const account = fixture.nativeElement.querySelector('a.nav-bar__account') as HTMLAnchorElement;
    expect(account).toBeTruthy();
    expect(account.getAttribute('href')).toBe('/profile');
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

  it('navigates to /cart on cart click when authenticated', async () => {
    userSubject.next(jane);
    await hydrate();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onCartClick();

    expect(navigate).toHaveBeenCalledWith(['/cart']);
  });

  it('shows the real cart item count as a badge once hydrated', async () => {
    countSignal.set(3);
    await hydrate();

    const badge = fixture.nativeElement.querySelector('.nav-bar__cart-badge');
    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toBe('3');
  });

  it('hides the badge when the cart is empty', async () => {
    countSignal.set(0);
    await hydrate();

    expect(fixture.nativeElement.querySelector('.nav-bar__cart-badge')).toBeNull();
  });

  it('primes the cart state for signed-in users on first client render', async () => {
    // afterNextRender already ran for the shared fixture (anonymous), so
    // create a fresh NavBar with the signed-in stub in place.
    authStub.isLoggedIn.mockReturnValue(true);
    const signedInFixture = TestBed.createComponent(NavBar);
    signedInFixture.detectChanges();
    await signedInFixture.whenStable();

    expect(cartStub.load).toHaveBeenCalledTimes(1);
  });

  it('navigates to /discover when the search icon is clicked', async () => {
    await hydrate();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const searchBtn = fixture.nativeElement.querySelector('.nav-bar__icon-btn') as HTMLButtonElement;
    searchBtn.click();

    expect(navigate).toHaveBeenCalledWith(['/discover']);
  });
});
