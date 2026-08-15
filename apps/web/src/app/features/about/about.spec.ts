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

  it('serves the hero as a responsive picture with a WebP source and a JPEG fallback', () => {
    const el: HTMLElement = fixture.nativeElement;
    const source = el.querySelector('.about-hero__picture source') as HTMLSourceElement;
    const img = el.querySelector('.about-hero__image') as HTMLImageElement;

    expect(source.type).toBe('image/webp');
    expect(source.srcset).toContain('.webp 640w');
    expect(source.srcset).toContain('.webp 1536w');
    expect(img.getAttribute('srcset')).toContain('.jpg 640w');
    expect(img.getAttribute('sizes')).toBe('100vw');
  });

  it('marks the hero as the LCP element and reserves its box', () => {
    const img = (fixture.nativeElement as HTMLElement).querySelector(
      '.about-hero__image',
    ) as HTMLImageElement;

    // Decorative: the <h1> carries the meaning, so the image must stay out of the a11y tree.
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
    // Priority hints — the hero must not be lazy-loaded or deprioritised.
    expect(img.getAttribute('fetchpriority')).toBe('high');
    expect(img.getAttribute('loading')).toBe('eager');
    // Intrinsic dimensions prevent layout shift before the image arrives.
    expect(img.getAttribute('width')).toBe('1536');
    expect(img.getAttribute('height')).toBe('1024');
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
