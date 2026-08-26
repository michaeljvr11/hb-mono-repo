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

  it('names exactly the two real cookies in the "What we use" table and never claims one stores the cart', () => {
    const el: HTMLElement = fixture.nativeElement;
    const table = el.querySelector('table');
    expect(table).toBeTruthy();
    const tableText = table?.textContent ?? '';
    expect(tableText).toContain('RefreshToken');
    expect(tableText).toContain('g_oauth_state');
    // Scoped to the cookie table itself — a regression that renames the copy
    // (e.g. "we set a cookie to store your cart") must still fail this, since
    // no cookie in this table is permitted to be about the cart at all.
    expect(tableText.toLowerCase()).not.toMatch(/cart/i);
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
