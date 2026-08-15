import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { AuthUser } from '@hb/shared';

import { Services } from './services';
import { AuthService } from '../../core/auth/auth.service';

describe('Services', () => {
  let fixture: ComponentFixture<Services>;
  let component: Services;

  beforeEach(async () => {
    const authStub = {
      isLoggedIn: vi.fn().mockReturnValue(false),
      currentUser$: new BehaviorSubject<AuthUser | null>(null),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [Services],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Services);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the hero, import service and marketplace headings', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Our Services');
    expect(el.textContent).toContain('Personal & Business Import Service');
    expect(el.textContent).toContain('How It Works');
    expect(el.textContent).toContain('Also Shop the H&B Marketplace');
  });

  it('links the quote CTA to /contact', () => {
    const el: HTMLElement = fixture.nativeElement;
    const cta = el.querySelector('.services-cta__btn') as HTMLAnchorElement;
    expect(cta).toBeTruthy();
    expect(cta.getAttribute('routerLink') ?? cta.getAttribute('href')).toContain('/contact');
  });

  it('cross-links the marketplace section to /shop', () => {
    const el: HTMLElement = fixture.nativeElement;
    const links = Array.from(el.querySelectorAll('.services-marketplace-card a')) as HTMLAnchorElement[];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('routerLink') ?? link.getAttribute('href')).toContain('/shop');
    }
  });

  it('names the Procurement Service and states it is a standing, permanent offering', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Procurement Service');
    expect(text).toContain('permanent');
  });

  it('names "Procurement Service" in the import-service section itself, not only in the later cross-link', () => {
    const el: HTMLElement = fixture.nativeElement;
    const importSection = el.querySelector('#import-service-heading')?.closest('section');
    expect(importSection?.textContent).toContain('Procurement Service');
  });

  it('gives the trust-banner an accurate, non-storefront aria-label on this page', () => {
    const el: HTMLElement = fixture.nativeElement;
    const banner = el.querySelector('.trust-banner');
    expect(banner?.getAttribute('aria-label')).toBe('Why use the Procurement Service');
  });

  it('never implies H&B owns marketplace inventory', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text.toLowerCase()).toContain('vendor-owned stock');
  });

  it('states the corridor as South Africa to Namibia, never "worldwide"', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('South Africa');
    expect(text).toContain('Namibia');
    expect(text.toLowerCase()).not.toContain('worldwide');
  });

  it('never publishes margin/commission percentages', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toMatch(/\d+\s*%/);
  });

  it('sets a real page title and meta description', () => {
    const title = TestBed.inject(Title);
    const meta = TestBed.inject(Meta);
    expect(title.getTitle()).toContain('Procurement Service');
    expect(meta.getTag('name="description"')?.content).toContain('Namibia');
  });

  it('never uses the retired marketplace-teaser phrasing', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent?.toLowerCase() ?? '';
    expect(text).not.toContain('psst! coming soon');
    expect(text).not.toContain('coming soon');
    expect(text).not.toContain('launching soon');
    expect(text).not.toContain('future marketplace');
  });
});
