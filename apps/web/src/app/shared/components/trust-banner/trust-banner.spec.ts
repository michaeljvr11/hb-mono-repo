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

  it('renders the three default trust cards from the storefront design', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Secure Regional Payments');
    expect(el.textContent).toContain('Express ZA-NA Logistics');
    expect(el.textContent).toContain('Simplified Customs');

    const cards = el.querySelectorAll('.trust-card');
    expect(cards.length).toBe(3);
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
});
