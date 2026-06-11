import { TestBed } from '@angular/core/testing';
import { HttpRequest } from '@angular/common/http';
import { authInterceptor } from './auth-interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  it('adds the backend bearer token when present', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            getToken: () => 'test-token'
          }
        }
      ]
    });

    const request = new HttpRequest('GET', '/api/users/me');

    TestBed.runInInjectionContext(() => {
      authInterceptor(request, req => {
        expect(req.headers.get('Authorization')).toBe('Bearer test-token');
        return {} as never;
      });
    });
  });
});
