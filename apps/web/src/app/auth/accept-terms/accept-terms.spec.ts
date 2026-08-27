import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AcceptTerms } from './accept-terms';
import { AuthService } from '../../core/auth/auth.service';

describe('AcceptTerms', () => {
  let fixture: ComponentFixture<AcceptTerms>;
  let component: AcceptTerms;
  let authStub: { acceptTerms: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };
  let router: Router;

  async function makeFixture(queryParams: Record<string, string> = {}) {
    // Tests that need different query params rebuild the module, so tear the
    // previous one down first.
    TestBed.resetTestingModule();
    authStub = { acceptTerms: vi.fn(), logout: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AcceptTerms],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: AuthService, useValue: authStub },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AcceptTerms);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await makeFixture({ returnUrl: '/checkout' });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('says why the account is being asked, and links both documents', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('signed in with Google');
    expect(el.querySelector('a[href="/legal/terms"]')).toBeTruthy();
    expect(el.querySelector('a[href="/legal/privacy"]')).toBeTruthy();
  });

  it('records acceptance and returns to where the guard bounced from', async () => {
    authStub.acceptTerms.mockReturnValue(of({ user: { id: 'u1' } }));

    component.accept();
    await fixture.whenStable();

    expect(authStub.acceptTerms).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/checkout');
  });

  it('falls back to /shop when there is no returnUrl', async () => {
    await makeFixture();
    authStub.acceptTerms.mockReturnValue(of({ user: { id: 'u1' } }));

    component.accept();
    await fixture.whenStable();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/shop');
  });

  // An open-redirect through returnUrl would be a real hole; the shared
  // sanitiser rejects absolute URLs, and this asserts it is actually applied.
  it('does not follow an off-site returnUrl', async () => {
    await makeFixture({ returnUrl: 'https://evil.example/steal' });
    authStub.acceptTerms.mockReturnValue(of({ user: { id: 'u1' } }));

    component.accept();
    await fixture.whenStable();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/shop');
  });

  // The API fails rather than reporting an acceptance it could not record, so
  // a failure here must keep the person on this screen.
  it('keeps the user here and shows an error when the write fails', async () => {
    authStub.acceptTerms.mockReturnValue(throwError(() => ({ status: 500 })));

    component.accept();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('could not record your acceptance');
  });

  it('guards against a double submit', async () => {
    authStub.acceptTerms.mockReturnValue(of({ user: { id: 'u1' } }));
    component.isSubmitting.set(true);

    component.accept();
    await fixture.whenStable();

    expect(authStub.acceptTerms).not.toHaveBeenCalled();
  });

  it('offers signing out instead of accepting', async () => {
    component.declineAndSignOut();
    expect(authStub.logout).toHaveBeenCalledTimes(1);
  });
});
