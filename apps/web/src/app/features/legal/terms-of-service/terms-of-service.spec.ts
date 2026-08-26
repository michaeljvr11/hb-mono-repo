import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser } from '@hb/shared';

import { TermsOfService } from './terms-of-service';
import { AuthService } from '../../../core/auth/auth.service';
import { CONTACT_DETAILS } from '../../../shared/constants/site.constants';

/** Finds the <p> that immediately follows the <h2> whose text matches `heading`. */
function paragraphAfterHeading(el: HTMLElement, heading: string): string {
  const headings = Array.from(el.querySelectorAll('h2'));
  const match = headings.find((h) => h.textContent?.trim() === heading);
  const paragraph = match?.nextElementSibling;
  return paragraph?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('TermsOfService', () => {
  let fixture: ComponentFixture<TermsOfService>;
  let component: TermsOfService;

  beforeEach(async () => {
    const authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [TermsOfService],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TermsOfService);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders all nine numbered section headings', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Terms of Service');
    expect(el.textContent).toContain('1. Who we are (mandatory pre-sale disclosure)');
    expect(el.textContent).toContain('2. Two kinds of purchase on this Platform');
    expect(el.textContent).toContain('3. Placing an order');
    expect(el.textContent).toContain('4. Payment');
    expect(el.textContent).toContain('5. Delivery');
    expect(el.textContent).toContain('6. Your right to cancel (cooling-off)');
    expect(el.textContent).toContain('7. Liability');
    expect(el.textContent).toContain('8. Governing law');
    expect(el.textContent).toContain('9. Changes to these terms');
  });

  it('sets a real page title and meta description', () => {
    const title = TestBed.inject(Title);
    const meta = TestBed.inject(Meta);
    expect(title.getTitle()).toContain('Terms of Service');
    expect(meta.getTag('name="description"')?.content).toContain('H&B');
  });

  it('states the mandatory-disclosure contact facts from the shared CONTACT_DETAILS constant', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain(CONTACT_DETAILS.email);
    expect(el.textContent).toContain(CONTACT_DETAILS.phoneDisplay);
    expect(el.querySelector(`a[href="${CONTACT_DETAILS.emailHref}"]`)).toBeTruthy();
    expect(el.querySelector(`a[href="${CONTACT_DETAILS.phoneHref}"]`)).toBeTruthy();
    expect(el.textContent).toContain('1 business day');
  });

  it('states the 7-day cooling-off right to cancel', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('7 days');
    expect(el.textContent).toContain('cooling-off');
  });

  it('renders the unresolved facts as visible placeholder tokens', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('[GOVERNING LAW JURISDICTION]');
    expect(el.textContent).toContain('[LEGAL ENTITY NAME]');
    expect(el.querySelectorAll('.legal-placeholder').length).toBeGreaterThan(0);
  });

  it('renders §4 Payment as an unresolved placeholder, not any named provider', () => {
    const el: HTMLElement = fixture.nativeElement;
    const paymentParagraph = paragraphAfterHeading(el, '4. Payment');
    expect(paymentParagraph).toBe(
      'Payment is processed by [PAYMENT PROVIDER], a licensed third-party payment provider. We do not store your card details.',
    );

    const headings = Array.from(el.querySelectorAll('h2'));
    const paymentHeading = headings.find((h) => h.textContent?.trim() === '4. Payment');
    const paymentPlaceholder = paymentHeading?.nextElementSibling?.querySelector(
      '.legal-placeholder',
    );
    expect(paymentPlaceholder?.textContent?.trim()).toBe('[PAYMENT PROVIDER]');
  });

  it('links to Shipping, Returns, Cookie, and Privacy policies', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a[href="/legal/shipping"]')).toBeTruthy();
    expect(el.querySelector('a[href="/legal/returns"]')).toBeTruthy();
    expect(el.querySelector('a[href="/legal/cookies"]')).toBeTruthy();
    expect(el.querySelector('a[href="/legal/privacy"]')).toBeTruthy();
  });
});
