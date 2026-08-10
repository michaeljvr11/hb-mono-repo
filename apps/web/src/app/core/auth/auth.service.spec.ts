import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { AuthService } from './auth.service';
import { WishlistService } from '../api/wishlist.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let wishlistStub: { reset: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    wishlistStub = { reset: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: WishlistService, useValue: wishlistStub },
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
});
