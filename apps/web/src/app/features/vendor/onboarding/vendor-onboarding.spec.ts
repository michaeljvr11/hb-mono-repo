import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VendorDto, VendorStatus, CountryCode } from '@hb/shared';

import { VendorOnboarding } from './vendor-onboarding';
import { AuthService } from '../../../core/auth/auth.service';
import { VendorsService } from '../../../core/api/vendors.service';

// ─── Stubs ──────────────────────────────────────────────────────────────────

interface AuthServiceStub {
  currentUser$: Observable<unknown>;
  refreshCurrentUser: ReturnType<typeof vi.fn>;
}

interface VendorsServiceStub {
  create: ReturnType<typeof vi.fn>;
  getMe: ReturnType<typeof vi.fn>;
}

function makeAuthStub(role: string | null): AuthServiceStub {
  const user = role ? { id: 'u1', email: 'a@b.com', role } : null;
  return {
    currentUser$: of(user),
    refreshCurrentUser: vi.fn(() => of(user)),
  };
}

function makeVendorStub(getMe$: Observable<VendorDto>): VendorsServiceStub {
  return {
    create: vi.fn(),
    getMe: vi.fn(() => getMe$),
  };
}

const PENDING_VENDOR: VendorDto = {
  id: 'v1',
  businessName: 'Acme',
  status: VendorStatus.PENDING,
  countryCode: CountryCode.SOUTH_AFRICA,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createFixture(
  authStub: AuthServiceStub,
  vendorStub: VendorsServiceStub,
): Promise<ComponentFixture<VendorOnboarding>> {
  await TestBed.configureTestingModule({
    imports: [VendorOnboarding],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      { provide: AuthService, useValue: authStub },
      { provide: VendorsService, useValue: vendorStub },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(VendorOnboarding);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

// ─── Customer mode (form) ────────────────────────────────────────────────────

describe('VendorOnboarding — customer mode (form)', () => {
  let fixture: ComponentFixture<VendorOnboarding>;
  let component: VendorOnboarding;
  let authStub: AuthServiceStub;
  let vendorStub: VendorsServiceStub;

  beforeEach(async () => {
    authStub = makeAuthStub('customer');
    vendorStub = makeVendorStub(of(PENDING_VENDOR));
    fixture = await createFixture(authStub, vendorStub);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the application form with businessName control', () => {
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector<HTMLInputElement>('#businessName');
    expect(input).not.toBeNull();
    expect(component.applyForm.controls.businessName).toBeDefined();
  });

  it('does not render a file input anywhere', () => {
    const el: HTMLElement = fixture.nativeElement;
    const fileInput = el.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeNull();
  });

  it('shows form in initial screen state', () => {
    expect(component.screenState()).toBe('form');
  });

  it('submit is disabled while isSubmitting is true', () => {
    component.isSubmitting.set(true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const btn = el.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(btn?.disabled).toBe(true);
  });

  it('marks form invalid and does not call create when businessName is empty', () => {
    component.submit();
    expect(vendorStub.create).not.toHaveBeenCalled();
  });

  it('valid submit calls VendorsService.create with correct payload', async () => {
    vendorStub.create.mockReturnValue(of(PENDING_VENDOR));
    authStub.refreshCurrentUser.mockReturnValue(of({ id: 'u1', role: 'vendor' }));

    component.applyForm.controls.businessName.setValue('Acme Trading');
    component.applyForm.controls.acceptedTerms.setValue(true);
    component.applyForm.controls.tradingName.setValue('Acme');
    component.applyForm.controls.registrationNumber.setValue('2024/001/07');
    component.applyForm.controls.countryCode.setValue(CountryCode.SOUTH_AFRICA);

    component.submit();
    await fixture.whenStable();

    expect(vendorStub.create).toHaveBeenCalledWith({
      businessName: 'Acme Trading',
      acceptedTerms: true,
      tradingName: 'Acme',
      registrationNumber: '2024/001/07',
      countryCode: CountryCode.SOUTH_AFRICA,
    });
  });

  it('successful submit calls AuthService.refreshCurrentUser', async () => {
    vendorStub.create.mockReturnValue(of(PENDING_VENDOR));
    authStub.refreshCurrentUser.mockReturnValue(of({ id: 'u1', role: 'vendor' }));

    component.applyForm.controls.businessName.setValue('Acme Trading');
    component.applyForm.controls.acceptedTerms.setValue(true);
    component.submit();
    await fixture.whenStable();

    expect(authStub.refreshCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('successful submit shows pending-confirm state', async () => {
    vendorStub.create.mockReturnValue(of(PENDING_VENDOR));
    authStub.refreshCurrentUser.mockReturnValue(of({ id: 'u1', role: 'vendor' }));

    component.applyForm.controls.businessName.setValue('Acme Trading');
    component.applyForm.controls.acceptedTerms.setValue(true);
    component.submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.screenState()).toBe('pending-confirm');

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Application Submitted');
  });

  it('409 from create shows already-applied message', async () => {
    vendorStub.create.mockReturnValue(throwError(() => ({ status: 409 })));
    authStub.refreshCurrentUser.mockReturnValue(of({ id: 'u1', role: 'vendor' }));
    vendorStub.getMe.mockReturnValue(of(PENDING_VENDOR));

    component.applyForm.controls.businessName.setValue('Acme Trading');
    component.applyForm.controls.acceptedTerms.setValue(true);
    component.submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.screenState()).toBe('already-applied');

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("You've already applied");
  });

  it('non-409 error shows inline error and keeps form usable', async () => {
    vendorStub.create.mockReturnValue(throwError(() => ({ status: 500, error: { message: 'Server error' } })));

    component.applyForm.controls.businessName.setValue('Acme Trading');
    component.applyForm.controls.acceptedTerms.setValue(true);
    component.submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.screenState()).toBe('form');
    expect(component.errorMessage()).toBeTruthy();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Server error');
  });

  // LC-7: the Vendor Agreement acceptance gates the application, and an
  // unticked box must not get through — `required` alone is satisfied by
  // `false` on a checkbox, which is why the control uses requiredTrue.
  it('does not call create when the Vendor Agreement box is unticked', () => {
    component.applyForm.controls.businessName.setValue('Acme Trading');
    component.applyForm.controls.acceptedTerms.setValue(false);

    component.submit();

    expect(vendorStub.create).not.toHaveBeenCalled();
    expect(component.acceptedTermsControl.hasError('required')).toBe(true);
  });

  it('renders a consent checkbox linking the Vendor Agreement page', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('input#vendorAcceptedTerms[type="checkbox"]')).toBeTruthy();
    expect(el.querySelector('a[href="/legal/vendor-agreement"]')).toBeTruthy();
  });

  it('does not pre-tick the consent checkbox', () => {
    expect(component.applyForm.controls.acceptedTerms.value).toBe(false);
  });

  it('submit is guarded against double-submit', async () => {
    vendorStub.create.mockReturnValue(of(PENDING_VENDOR));
    authStub.refreshCurrentUser.mockReturnValue(of({ id: 'u1', role: 'vendor' }));

    component.isSubmitting.set(true);
    component.applyForm.controls.businessName.setValue('Acme Trading');
    component.applyForm.controls.acceptedTerms.setValue(true);
    component.submit();
    await fixture.whenStable();

    expect(vendorStub.create).not.toHaveBeenCalled();
  });
});

// ─── Vendor mode (status screen) ─────────────────────────────────────────────

describe('VendorOnboarding — vendor mode (status screen)', () => {
  async function makeVendorModeFixture(
    status: VendorStatus,
  ): Promise<{ fixture: ComponentFixture<VendorOnboarding>; el: HTMLElement }> {
    const vendor: VendorDto = { ...PENDING_VENDOR, status };
    const authStub = makeAuthStub('vendor');
    const vendorStub = makeVendorStub(of(vendor));

    const fixture = await createFixture(authStub, vendorStub);
    await fixture.whenStable();
    fixture.detectChanges();

    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders the vendor-status screen for role=vendor', async () => {
    const { fixture } = await makeVendorModeFixture(VendorStatus.PENDING);
    expect(fixture.componentInstance.screenState()).toBe('vendor-status');
  });

  it('does not render a file input in vendor-status mode', async () => {
    const { el } = await makeVendorModeFixture(VendorStatus.PENDING);
    expect(el.querySelector('input[type="file"]')).toBeNull();
  });

  it('pending status shows "under review" message', async () => {
    const { el } = await makeVendorModeFixture(VendorStatus.PENDING);
    expect(el.textContent).toContain('under review');
  });

  it('approved status shows approved message and dashboard link', async () => {
    const { el } = await makeVendorModeFixture(VendorStatus.APPROVED);
    expect(el.textContent).toContain("approved");
    const dashboardLink = el.querySelector<HTMLAnchorElement>('a[href="/vendor"]') ??
      el.querySelector<HTMLAnchorElement>('[routerLink="/vendor"]');
    expect(dashboardLink).not.toBeNull();
  });

  it('rejected status shows not-approved message and support link', async () => {
    const { el } = await makeVendorModeFixture(VendorStatus.REJECTED);
    expect(el.textContent).toContain('not approved');
    const supportLink = el.querySelector<HTMLAnchorElement>('a[href="mailto:support@hb-ecommerce.com"]');
    expect(supportLink).not.toBeNull();
  });

  it('suspended status shows suspended message and support link', async () => {
    const { el } = await makeVendorModeFixture(VendorStatus.SUSPENDED);
    expect(el.textContent).toContain('suspended');
    const supportLink = el.querySelector<HTMLAnchorElement>('a[href="mailto:support@hb-ecommerce.com"]');
    expect(supportLink).not.toBeNull();
  });

  it('calls VendorsService.getMe when role is vendor', async () => {
    const authStub = makeAuthStub('vendor');
    const vendorStub = makeVendorStub(of(PENDING_VENDOR));

    await createFixture(authStub, vendorStub);

    expect(vendorStub.getMe).toHaveBeenCalledTimes(1);
  });

  it('shows error state when getMe fails', async () => {
    const authStub = makeAuthStub('vendor');
    const vendorStub: VendorsServiceStub = {
      create: vi.fn(),
      getMe: vi.fn(() => throwError(() => new Error('500'))),
    };

    const fixture = await createFixture(authStub, vendorStub);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.statusError()).toBeTruthy();
  });
});

// ─── No file input anywhere ──────────────────────────────────────────────────

describe('VendorOnboarding — no file input', () => {
  it('never renders input[type=file] in customer form mode', async () => {
    const authStub = makeAuthStub('customer');
    const vendorStub = makeVendorStub(of(PENDING_VENDOR));
    const fixture = await createFixture(authStub, vendorStub);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('input[type="file"]')).toBeNull();
  });

  it('never renders input[type=file] in vendor-status mode', async () => {
    const authStub = makeAuthStub('vendor');
    const vendorStub = makeVendorStub(of(PENDING_VENDOR));
    const fixture = await createFixture(authStub, vendorStub);
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('input[type="file"]')).toBeNull();
  });
});
