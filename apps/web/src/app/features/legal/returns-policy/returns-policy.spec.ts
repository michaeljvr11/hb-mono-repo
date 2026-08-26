import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser } from '@hb/shared';

import { ReturnsPolicy } from './returns-policy';
import { AuthService } from '../../../core/auth/auth.service';
import { CONTACT_DETAILS } from '../../../shared/constants/site.constants';

describe('ReturnsPolicy', () => {
  let fixture: ComponentFixture<ReturnsPolicy>;
  let component: ReturnsPolicy;

  beforeEach(async () => {
    const authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ReturnsPolicy],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReturnsPolicy);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the key section headings', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Returns & Refunds Policy');
    expect(el.textContent).toContain('Your right to change your mind');
    expect(el.textContent).toContain('If something arrives damaged or wrong');
    expect(el.textContent).toContain('How refunds work today');
    expect(el.textContent).toContain('Marketplace vs Procurement Service returns');
    expect(el.textContent).toContain("What doesn't qualify");
  });

  it('sets a real page title and meta description', () => {
    const title = TestBed.inject(Title);
    const meta = TestBed.inject(Meta);
    expect(title.getTitle()).toContain('Returns & Refunds Policy');
    expect(meta.getTag('name="description"')?.content).toContain('H&B');
  });

  it('states the manual-refund disclosure without claiming an automated flow exists', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('processed manually by our support team');
    expect(el.textContent).toContain('not through an automated self-service flow');
    expect(el.textContent).not.toContain('instant refund');
  });

  it('states the 7-day cooling-off right and the 48-hour damage-claim window', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('7 days');
    expect(el.textContent).toContain('48 hours');
  });

  it('describes both the Marketplace and Procurement Service return paths', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Marketplace purchases');
    expect(el.textContent).toContain('Procurement Service purchases');
    expect(el.textContent).toContain('seller of record');
  });

  it('states the cancellation contact facts from the shared CONTACT_DETAILS constant', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain(CONTACT_DETAILS.email);
    expect(el.querySelector(`a[href="${CONTACT_DETAILS.emailHref}"]`)).toBeTruthy();
  });

  it('renders the unresolved exclusions list as a visible placeholder token', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('[EXCLUSIONS LIST]');
    expect(el.querySelectorAll('.legal-placeholder').length).toBeGreaterThan(0);
  });

  it('links to the Shipping policy and Terms of Service', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a[href="/legal/shipping"]')).toBeTruthy();
    expect(el.querySelector('a[href="/legal/terms"]')).toBeTruthy();
  });
});
