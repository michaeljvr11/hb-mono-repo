import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser } from '@hb/shared';

import { VendorAgreement } from './vendor-agreement';
import { AuthService } from '../../../core/auth/auth.service';

describe('VendorAgreement', () => {
  let fixture: ComponentFixture<VendorAgreement>;
  let component: VendorAgreement;

  beforeEach(async () => {
    const authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [VendorAgreement],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorAgreement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sets a real page title and meta description', () => {
    const title = TestBed.inject(Title);
    const meta = TestBed.inject(Meta);
    expect(title.getTitle()).toContain('Vendor Agreement');
    expect(meta.getTag('name="description"')?.content).toContain('commission');
  });

  // Card LC-7 AC 2 — must not overstate verification that does not happen.
  it('states plainly that onboarding is self-declared and unverified', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('self-declared and is not independently verified');
    expect(text).toContain('no proof of registration');
  });

  it('never claims H&B has verified a vendor identity or trading right', () => {
    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    expect(text).not.toContain('verified vendor');
    expect(text).not.toContain('we verify');
    expect(text).not.toContain('once we have verified');
  });

  // Card LC-7 AC 3 — the rate shown, framed as changeable and never retroactive.
  it('publishes the commission rate and the complementary vendor share', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(component.commissionPercent).toBe(15);
    expect(component.vendorSharePercent).toBe(85);
    expect(text).toContain('15%');
    expect(text).toContain('85%');
  });

  it('frames the rate as changeable and never retroactively restated', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('This rate can change');
    expect(text).toContain('never retroactively restate');
  });

  // Card LC-7 AC 2 — payout timing must not imply an automated bank payout.
  it('does not imply an automated payout exists today', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('not an automatic bank payment');
    expect(text).toContain('no settlement job exists');
    expect(text.toLowerCase()).not.toContain('paid out automatically');
  });

  it('mirrors the API damage-claim window rather than restating a number', () => {
    expect(component.damageClaimWindowHours).toBe(48);
    expect(fixture.nativeElement.textContent).toContain('48-hour damage-claim window');
  });

  // Verified against the code: no cancellation fee exists anywhere.
  it('states that no vendor cancellation fee is charged today', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('does not currently charge vendors a cancellation fee');
  });

  it('states the confirmed termination notice period rather than a placeholder', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("one month's notice");
    expect(el.textContent).toContain('paid out on the normal settlement schedule');
    expect(el.textContent).not.toContain('[TERMINATION TERMS]');
    expect(el.querySelectorAll('.legal-placeholder').length).toBe(0);
  });

  it('links to the Terms of Service and Privacy Policy', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a[href="/legal/terms"]')).toBeTruthy();
    expect(el.querySelector('a[href="/legal/privacy"]')).toBeTruthy();
  });
});
