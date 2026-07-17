import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserDto, UserRole } from '@hb/shared';

import { ProfileDetails } from './profile-details';
import { AuthService } from '../../../../core/auth/auth.service';
import { ProfileService } from '../../../../core/api/profile.service';

interface AuthServiceStub {
  currentUser$: Observable<unknown>;
  refreshCurrentUser: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
}

interface ProfileServiceStub {
  getMe: ReturnType<typeof vi.fn>;
  updateProfile: ReturnType<typeof vi.fn>;
  changePassword: ReturnType<typeof vi.fn>;
}

const CURRENT_USER: UserDto = {
  id: 'u1',
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  role: UserRole.CUSTOMER,
};

function makeAuthStub(): AuthServiceStub {
  return {
    currentUser$: of(CURRENT_USER),
    refreshCurrentUser: vi.fn(() => of(CURRENT_USER)),
    logout: vi.fn(),
  };
}

function makeProfileStub(): ProfileServiceStub {
  return {
    getMe: vi.fn(() => of(CURRENT_USER)),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  };
}

async function createFixture(
  authStub: AuthServiceStub,
  profileStub: ProfileServiceStub,
): Promise<ComponentFixture<ProfileDetails>> {
  await TestBed.configureTestingModule({
    imports: [ProfileDetails],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      { provide: AuthService, useValue: authStub },
      { provide: ProfileService, useValue: profileStub },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ProfileDetails);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('ProfileDetails', () => {
  let fixture: ComponentFixture<ProfileDetails>;
  let component: ProfileDetails;
  let authStub: AuthServiceStub;
  let profileStub: ProfileServiceStub;

  beforeEach(async () => {
    authStub = makeAuthStub();
    profileStub = makeProfileStub();
    fixture = await createFixture(authStub, profileStub);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the current user and patches the details form', () => {
    expect(profileStub.getMe).toHaveBeenCalledTimes(1);
    expect(component.detailsForm.controls.firstName.value).toBe('Jane');
    expect(component.detailsForm.controls.lastName.value).toBe('Doe');
  });

  it('renders the email as read-only text, not an editable input', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('jane@example.com');
    expect(el.querySelector('input[formcontrolname="email"]')).toBeNull();
  });

  // ── Details form ─────────────────────────────────────────────────────────

  it('saves details and calls ProfileService.updateProfile with only the name fields', () => {
    profileStub.updateProfile.mockReturnValue(
      of({ ...CURRENT_USER, firstName: 'Janet', lastName: 'Doe' }),
    );

    component.detailsForm.setValue({ firstName: 'Janet', lastName: 'Doe' });
    component.saveDetails();

    expect(profileStub.updateProfile).toHaveBeenCalledWith({
      firstName: 'Janet',
      lastName: 'Doe',
    });
  });

  it('refreshes the shared current user after a successful details save', () => {
    profileStub.updateProfile.mockReturnValue(of(CURRENT_USER));

    component.detailsForm.setValue({ firstName: 'Jane', lastName: 'Doe' });
    component.saveDetails();

    expect(authStub.refreshCurrentUser).toHaveBeenCalledTimes(1);
    expect(component.detailsSuccess()).toBeTruthy();
  });

  it('shows an inline error when updateProfile fails', () => {
    profileStub.updateProfile.mockReturnValue(
      throwError(() => ({ error: { message: 'Something went wrong' } })),
    );

    component.detailsForm.setValue({ firstName: 'Jane', lastName: 'Doe' });
    component.saveDetails();
    fixture.detectChanges();

    expect(component.detailsError()).toBe('Something went wrong');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Something went wrong');
  });

  // ── Change password ──────────────────────────────────────────────────────

  it('does not call changePassword while the password form is invalid', () => {
    component.changePassword();
    expect(profileStub.changePassword).not.toHaveBeenCalled();
  });

  it('submits the password form and calls ProfileService.changePassword', () => {
    profileStub.changePassword.mockReturnValue(of({ message: 'ok' }));

    component.passwordForm.setValue({ currentPassword: 'oldpass1', newPassword: 'newpass123' });
    component.changePassword();

    expect(profileStub.changePassword).toHaveBeenCalledWith({
      currentPassword: 'oldpass1',
      newPassword: 'newpass123',
    });
    expect(component.passwordSuccess()).toContain('sign in again');
  });

  it('renders the inline error when the current password is wrong', () => {
    profileStub.changePassword.mockReturnValue(
      throwError(() => ({ error: { message: 'Current password is incorrect' } })),
    );

    component.passwordForm.setValue({ currentPassword: 'wrongpass', newPassword: 'newpass123' });
    component.changePassword();
    fixture.detectChanges();

    expect(component.passwordError()).toBe('Current password is incorrect');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Current password is incorrect');
  });

  it('does not call AuthService.logout immediately after a successful password change', () => {
    profileStub.changePassword.mockReturnValue(of({ message: 'ok' }));

    component.passwordForm.setValue({ currentPassword: 'oldpass1', newPassword: 'newpass123' });
    component.changePassword();

    expect(authStub.logout).not.toHaveBeenCalled();
  });

  it('calls AuthService.logout after the post-success delay', () => {
    vi.useFakeTimers();
    try {
      profileStub.changePassword.mockReturnValue(of({ message: 'ok' }));

      component.passwordForm.setValue({ currentPassword: 'oldpass1', newPassword: 'newpass123' });
      component.changePassword();

      vi.advanceTimersByTime(2000);

      expect(authStub.logout).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
