import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser } from '@hb/shared';

import { PrivacyPolicy } from './privacy-policy';
import { AuthService } from '../../../core/auth/auth.service';

describe('PrivacyPolicy', () => {
  let fixture: ComponentFixture<PrivacyPolicy>;
  let component: PrivacyPolicy;

  beforeEach(async () => {
    const authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PrivacyPolicy],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PrivacyPolicy);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the key section headings', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Privacy Policy');
    expect(el.textContent).toContain('Who we are');
    expect(el.textContent).toContain('What we collect');
    expect(el.textContent).toContain('Why we process it');
    expect(el.textContent).toContain('Who we share it with');
    expect(el.textContent).toContain('Your rights');
    expect(el.textContent).toContain('Complaints');
  });

  it('sets a real page title and meta description', () => {
    const title = TestBed.inject(Title);
    const meta = TestBed.inject(Meta);
    expect(title.getTitle()).toContain('Privacy Policy');
    expect(meta.getTag('name="description"')?.content).toContain('H&B');
  });

  it('renders the unresolved LC-1 facts as visible placeholder tokens', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('[LEGAL ENTITY NAME]');
    expect(el.textContent).toContain('[INFORMATION OFFICER EMAIL]');
    expect(el.querySelectorAll('.legal-placeholder').length).toBeGreaterThan(0);
  });

  it('links to the Cookie Policy', () => {
    const el: HTMLElement = fixture.nativeElement;
    const link = el.querySelector('a[href="/legal/cookies"]') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
  });
});
