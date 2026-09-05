import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TrustBanner, TrustBannerItem } from './trust-banner';

describe('TrustBanner', () => {
  let fixture: ComponentFixture<TrustBanner>;
  let component: TrustBanner;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TrustBanner] }).compileComponents();
    fixture = TestBed.createComponent(TrustBanner);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the four storefront waypoints in route order as the strip by default', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.trust-banner')?.classList.contains('trust-banner--strip')).toBe(true);

    const titles = Array.from(el.querySelectorAll('.trust-card__title')).map((t) => t.textContent);
    expect(titles).toEqual([
      'Ships from South Africa',
      'No customs duties (SACU)',
      'Pay in ZAR or NAD, 1:1',
      'Delivered to your door in Namibia',
    ]);
  });

  it('marks only the last waypoint as the destination', () => {
    const el: HTMLElement = fixture.nativeElement;
    const cards = el.querySelectorAll('.trust-card');
    expect(cards.length).toBe(4);
    expect(cards[3].classList.contains('trust-card--destination')).toBe(true);
    expect(el.querySelectorAll('.trust-card--destination').length).toBe(1);
  });

  it('renders custom items when provided', () => {
    const items: TrustBannerItem[] = [
      { icon: 'star', title: 'Custom One', description: 'Desc one' },
    ];
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Custom One');
    expect(el.querySelectorAll('.trust-card').length).toBe(1);
  });

  it('switches to the card grid with no destination marker for the cards variant', () => {
    fixture.componentRef.setInput('variant', 'cards');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const banner = el.querySelector('.trust-banner');
    expect(banner?.classList.contains('trust-banner--cards')).toBe(true);
    expect(banner?.classList.contains('trust-banner--strip')).toBe(false);
    expect(el.querySelectorAll('.trust-card--destination').length).toBe(0);
  });

  it('defaults the aria-label to the storefront copy', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.trust-banner')?.getAttribute('aria-label')).toBe('Why shop with H&B');
  });

  it('accepts a custom aria-label for non-storefront consumers', () => {
    fixture.componentRef.setInput('label', 'Why use the Procurement Service');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.trust-banner')?.getAttribute('aria-label')).toBe('Why use the Procurement Service');
  });

  it('renders short labels and no descriptions in the inline variant', () => {
    fixture.componentRef.setInput('variant', 'inline');
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.trust-banner')?.classList.contains('trust-banner--inline')).toBe(true);
    expect(el.querySelectorAll('.trust-card__desc').length).toBe(0);
    expect(el.querySelectorAll('.trust-card__title').length).toBe(0);
    expect(Array.from(el.querySelectorAll('.trust-card__label')).map((l) => l.textContent)).toEqual([
      'Ships from SA',
      'No customs duties',
      'ZAR or NAD, 1:1',
      'Delivered to your door',
    ]);
  });

  it('falls back to the full title when an inline item has no short form', () => {
    fixture.componentRef.setInput('variant', 'inline');
    fixture.componentRef.setInput('items', [
      { icon: 'star', title: 'Custom One', description: 'Desc one' },
    ] satisfies TrustBannerItem[]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.trust-card__label')?.textContent).toBe('Custom One');
  });

  it('marks no destination waypoint in the inline variant — it has no route line', () => {
    fixture.componentRef.setInput('variant', 'inline');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.trust-card--destination').length).toBe(0);
  });
});
