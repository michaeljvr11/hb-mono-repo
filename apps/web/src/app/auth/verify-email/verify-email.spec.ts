import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { VerifyEmail } from './verify-email';
import { AuthService } from '../../core/auth/auth.service';

describe('VerifyEmail', () => {
  let authService: { verifyEmail: ReturnType<typeof vi.fn> };
  let routeStub: { snapshot: { queryParamMap: ParamMap } };

  beforeEach(async () => {
    authService = { verifyEmail: vi.fn() };
    routeStub = { snapshot: { queryParamMap: convertToParamMap({ token: 'verify-tok' }) } };

    await TestBed.configureTestingModule({
      imports: [VerifyEmail],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: ActivatedRoute, useValue: routeStub },
      ],
    }).compileComponents();
  });

  // The component verifies on afterNextRender (browser only); call it directly
  // so tests are deterministic without a render pass.
  function runVerify(component: VerifyEmail) {
    (component as unknown as { verify: () => void }).verify();
  }

  it('starts in the verifying state', () => {
    authService.verifyEmail.mockReturnValue(of({ message: 'ok' }));
    const component = TestBed.createComponent(VerifyEmail).componentInstance;
    expect(component.state()).toBe('verifying');
  });

  it('shows success once the token verifies', () => {
    authService.verifyEmail.mockReturnValue(of({ message: 'Your email address is verified.' }));
    const component = TestBed.createComponent(VerifyEmail).componentInstance;

    runVerify(component);

    expect(authService.verifyEmail).toHaveBeenCalledWith('verify-tok');
    expect(component.state()).toBe('success');
    expect(component.message()).toBe('Your email address is verified.');
  });

  it('shows an error when the token is missing', () => {
    routeStub.snapshot.queryParamMap = convertToParamMap({});
    const component = TestBed.createComponent(VerifyEmail).componentInstance;

    runVerify(component);

    expect(authService.verifyEmail).not.toHaveBeenCalled();
    expect(component.state()).toBe('error');
  });

  it('shows an error when verification fails', () => {
    authService.verifyEmail.mockReturnValue(throwError(() => ({ error: { message: 'bad token' } })));
    const component = TestBed.createComponent(VerifyEmail).componentInstance;

    runVerify(component);

    expect(component.state()).toBe('error');
    expect(component.message()).toBe('bad token');
  });
});
