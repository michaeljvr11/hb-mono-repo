import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser } from '@hb/shared';

import { About } from './about';
import { AuthService } from '../../core/auth/auth.service';

describe('About', () => {
  let fixture: ComponentFixture<About>;
  let component: About;

  beforeEach(async () => {
    const authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [About],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(About);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the About hero, story, mission and closing CTA headings', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('About H&B');
    expect(el.textContent).toContain('Our Story');
    expect(el.textContent).toContain('Our Mission');
    expect(el.textContent).toContain('Ready to Bridge the Gap with Us?');
  });

  it('links the closing CTA to /contact', () => {
    const el: HTMLElement = fixture.nativeElement;
    const cta = el.querySelector('.about-cta__btn') as HTMLAnchorElement;
    expect(cta).toBeTruthy();
    expect(cta.getAttribute('routerLink') ?? cta.getAttribute('href')).toContain('/contact');
  });

  it('sets a real page title and meta description', () => {
    const title = TestBed.inject(Title);
    const meta = TestBed.inject(Meta);
    expect(title.getTitle()).toContain('About H&B');
    expect(meta.getTag('name="description"')?.content).toContain('H&B');
  });

  it('never claims a future-tense launch or a completed one', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent?.toLowerCase() ?? '';
    expect(text).not.toContain('building toward a full trusted marketplace tomorrow');
    expect(text).not.toContain('coming soon');
    expect(text).not.toContain('launching soon');
  });
});
