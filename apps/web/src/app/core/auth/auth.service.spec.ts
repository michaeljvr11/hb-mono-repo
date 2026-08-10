import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { AuthService } from './auth.service';
import { CartService } from '../api/cart.service';
import { WishlistService } from '../api/wishlist.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let wishlistStub: { reset: ReturnType<typeof vi.fn> };
  let cartStub: { reset: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    wishlistStub = { reset: vi.fn() };
    cartStub = { reset: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: WishlistService, useValue: wishlistStub },
        { provide: CartService, useValue: cartStub },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  // ── logout() → WishlistService.reset() ──────────────────────────────────

  it('resets the wishlist state on logout when a token is present (POST /auth/logout succeeds)', () => {
    localStorage.setItem('access_token', 'a-token');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    service.logout();

    httpMock.expectOne(`${environment.apiBaseUrl}/auth/logout`).flush({ message: 'ok' });

    expect(wishlistStub.reset).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('resets the wishlist state on logout even when the logout request errors', () => {
    localStorage.setItem('access_token', 'a-token');
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    service.logout();

    httpMock
      .expectOne(`${environment.apiBaseUrl}/auth/logout`)
      .error(new ProgressEvent('error'));

    expect(wishlistStub.reset).toHaveBeenCalledTimes(1);
  });

  it('resets the wishlist state on logout when there is no token (skips the API call entirely)', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    service.logout();

    httpMock.expectNone(`${environment.apiBaseUrl}/auth/logout`);
    expect(wishlistStub.reset).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  // ── logout() → CartService.reset() ──────────────────────────────────────
  // Without this the nav-bar cart badge keeps rendering the previous user's
  // item count for the rest of the tab session.

  it('resets the cart state on logout when a token is present (POST /auth/logout succeeds)', () => {
    localStorage.setItem('access_token', 'a-token');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    service.logout();

    httpMock.expectOne(`${environment.apiBaseUrl}/auth/logout`).flush({ message: 'ok' });

    expect(cartStub.reset).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('resets the cart state on logout even when the logout request errors', () => {
    localStorage.setItem('access_token', 'a-token');
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    service.logout();

    httpMock
      .expectOne(`${environment.apiBaseUrl}/auth/logout`)
      .error(new ProgressEvent('error'));

    expect(cartStub.reset).toHaveBeenCalledTimes(1);
  });

  it('resets the cart state on logout when there is no token (skips the API call entirely)', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    service.logout();

    httpMock.expectNone(`${environment.apiBaseUrl}/auth/logout`);
    expect(cartStub.reset).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
