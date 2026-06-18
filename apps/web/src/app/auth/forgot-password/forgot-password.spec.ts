import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { ForgotPassword } from './forgot-password';
import { AuthService } from '../../core/auth/auth.service';

describe('ForgotPassword', () => {
  let component: ForgotPassword;
  let fixture: ComponentFixture<ForgotPassword>;
  let authService: { forgotPassword: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = { forgotPassword: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [provideRouter([]), { provide: AuthService, useValue: authService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPassword);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not call the API while the email is invalid', () => {
    component.submit();
    expect(authService.forgotPassword).not.toHaveBeenCalled();
  });

  it('shows the server confirmation message on success', () => {
    authService.forgotPassword.mockReturnValue(of({ message: 'Check your inbox.' }));

    component.forgotForm.setValue({ email: 'a@b.com' });
    component.submit();

    expect(authService.forgotPassword).toHaveBeenCalledWith('a@b.com');
    expect(component.successMessage()).toBe('Check your inbox.');
  });

  it('surfaces a friendly error on failure', () => {
    authService.forgotPassword.mockReturnValue(throwError(() => ({ status: 500 })));

    component.forgotForm.setValue({ email: 'a@b.com' });
    component.submit();

    expect(component.errorMessage()).not.toBe('');
  });
});
