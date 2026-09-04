import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Footer } from './footer';
import { SOCIAL_LINKS } from '../../shared/constants/site.constants';

describe('Footer', () => {
  let component: Footer;
  let fixture: ComponentFixture<Footer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Footer],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Footer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the current year in the copyright line', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain(String(new Date().getFullYear()));
  });

  it('renders the Trade Info section', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Trade Info');
  });

  it('renders the SME Access section', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('SME Access');
  });

  // LC-8: every footer link whose page this card set built now points at it.
  it('points every built legal page at its real route', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    for (const route of [
      '/legal/shipping',
      '/legal/returns',
      '/legal/terms',
      '/legal/privacy',
      '/legal/cookies',
      '/legal/customs',
      '/legal/vendor-agreement',
    ]) {
      expect(el.querySelector(`a[href="${route}"]`)).toBeTruthy();
    }
  });

  // Privacy and Cookie Policy were reachable only from the consent banner
  // before this card — the banner disappears once a choice is made.
  it('makes the Privacy and Cookie policies discoverable from the footer', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('a[href="/legal/privacy"]')?.textContent).toContain(
      'Privacy Policy',
    );
    expect(el.querySelector('a[href="/legal/cookies"]')?.textContent).toContain(
      'Cookie Policy',
    );
  });

  // The only dead link left is Success Stories, which has no page behind it.
  // Anything else going dead is a regression, not a deliberate placeholder.
  it('leaves exactly one dead link, and it is Success Stories', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const dead = Array.from(el.querySelectorAll('a[href="#"]'));
    expect(dead).toHaveLength(1);
    expect(dead[0].textContent).toContain('Success Stories');
  });

  // The three dead Material glyph spans (public/shield/payments) were replaced
  // by real social links. Guard the count, the security-relevant new-tab
  // attributes, the URLs (against SOCIAL_LINKS, not hardcoded), the
  // accessible name, the deliberate Facebook omission, and that none of them
  // regress back into dead "#" links.
  describe('social links', () => {
    function socialLinks(): HTMLAnchorElement[] {
      const el: HTMLElement = fixture.nativeElement;
      return Array.from(el.querySelectorAll('.site-footer__social-link'));
    }

    it('renders exactly three social links', () => {
      fixture.detectChanges();
      expect(socialLinks()).toHaveLength(3);
    });

    it('opens every social link in a new tab without granting it access to window.opener', () => {
      fixture.detectChanges();
      for (const link of socialLinks()) {
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
      }
    });

    it("points each social link at its SOCIAL_LINKS URL", () => {
      fixture.detectChanges();
      const hrefs = socialLinks().map((a) => a.getAttribute('href'));
      expect(hrefs).toContain(SOCIAL_LINKS.whatsapp);
      expect(hrefs).toContain(SOCIAL_LINKS.instagram);
      expect(hrefs).toContain(SOCIAL_LINKS.tiktok);
    });

    it('gives every social link a non-empty accessible label (the icon svgs are aria-hidden)', () => {
      fixture.detectChanges();
      for (const link of socialLinks()) {
        expect(link.getAttribute('aria-label')?.trim()).toBeTruthy();
      }
    });

    it('renders no Facebook link — the business deliberately has no Facebook page', () => {
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('a[aria-label*="Facebook" i]')).toBeNull();
      expect(el.querySelector('a[href*="facebook.com"]')).toBeNull();
    });

    it('leaves no dead "#" links inside the social nav', () => {
      fixture.detectChanges();
      const dead = socialLinks().filter((a) => a.getAttribute('href') === '#');
      expect(dead).toHaveLength(0);
    });
  });
});
