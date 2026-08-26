import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser } from '@hb/shared';

import { CookiePolicy } from './cookie-policy';
import { AuthService } from '../../../core/auth/auth.service';

describe('CookiePolicy', () => {
  let fixture: ComponentFixture<CookiePolicy>;
  let component: CookiePolicy;

  beforeEach(async () => {
    const authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CookiePolicy],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CookiePolicy);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the key section headings', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Cookie Policy');
    expect(el.textContent).toContain('What we use');
    expect(el.textContent).toContain("Browser storage we use that isn't cookies");
    expect(el.textContent).toContain('Your choice');
    expect(el.textContent).toContain('Third-party cookies');
  });

  it('sets a real page title and meta description', () => {
    const title = TestBed.inject(Title);
    const meta = TestBed.inject(Meta);
    expect(title.getTitle()).toContain('Cookie Policy');
    expect(meta.getTag('name="description"')?.content).toContain('H&B');
  });

  it('names the two real cookies and does not claim the cart is stored in one', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('RefreshToken');
    expect(el.textContent).toContain('g_oauth_state');
    expect(el.textContent?.toLowerCase()).not.toContain('remember your cart');
  });

  it('states GA is not configured yet rather than claiming it is running', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No Google Analytics property is configured yet');
    expect(text).toContain('no analytics cookies are being set today');
  });

  it('links to the Privacy Policy', () => {
    const el: HTMLElement = fixture.nativeElement;
    const link = el.querySelector('a[href="/legal/privacy"]') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
  });
});
