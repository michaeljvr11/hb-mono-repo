import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Footer } from './footer';

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
});
