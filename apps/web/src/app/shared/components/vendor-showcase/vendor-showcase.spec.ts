import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CountryCode, VendorDto, VendorStatus } from '@hb/shared';

import { VendorShowcase } from './vendor-showcase';

describe('VendorShowcase', () => {
  let fixture: ComponentFixture<VendorShowcase>;
  let component: VendorShowcase;

  const vendors: VendorDto[] = [
    {
      id: 'v1',
      businessName: 'Roots & Shoots Art',
      status: VendorStatus.APPROVED,
      countryCode: CountryCode.SOUTH_AFRICA,
    },
    {
      id: 'v2',
      businessName: 'Leko Organics',
      status: VendorStatus.PENDING,
      countryCode: CountryCode.NAMIBIA,
      logoUrl: 'http://a.com/leko.png',
    },
  ];

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({ imports: [VendorShowcase] }).compileComponents();
    fixture = TestBed.createComponent(VendorShowcase);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('vendors', vendors);
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('renders one card per vendor with name and where it ships from', async () => {
    await setup();
    const cards = fixture.nativeElement.querySelectorAll('.vendor-card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Roots & Shoots Art');
    expect(cards[0].textContent).toContain('Ships from South Africa');
    expect(cards[1].textContent).toContain('Leko Organics');
    expect(cards[1].textContent).toContain('Ships from Namibia');
  });

  it('renders no rating — there is no rating data to show', async () => {
    await setup();
    expect(fixture.nativeElement.querySelectorAll('.vendor-card__star').length).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain('star');
  });

  it('marks approved vendors only', async () => {
    await setup();
    const cards = fixture.nativeElement.querySelectorAll('.vendor-card');
    expect(cards[0].querySelector('.vendor-card__approved')).toBeTruthy();
    expect(cards[1].querySelector('.vendor-card__approved')).toBeNull();
  });

  it('uses the logo when set and initials otherwise', async () => {
    await setup();
    const cards = fixture.nativeElement.querySelectorAll('.vendor-card');
    expect(cards[0].querySelector('.vendor-card__avatar')?.textContent?.trim()).toBe('RS');
    const logo = cards[1].querySelector('img.vendor-card__avatar--logo') as HTMLImageElement;
    expect(logo.src).toBe('http://a.com/leko.png');
  });

  it('shows the listing count when provided, with correct pluralisation', async () => {
    await setup();
    fixture.componentRef.setInput('listingCounts', { v1: 1, v2: 4 });
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.vendor-card');
    expect(cards[0].textContent).toContain('1 listing');
    expect(cards[0].textContent).not.toContain('1 listings');
    expect(cards[1].textContent).toContain('4 listings');
  });

  it('shows no count line for a vendor without an entry', async () => {
    await setup();
    fixture.componentRef.setInput('listingCounts', { v1: 2 });
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.vendor-card');
    expect(cards[0].querySelector('.vendor-card__line--count')).toBeTruthy();
    expect(cards[1].querySelector('.vendor-card__line--count')).toBeNull();
  });

  it('emits vendorSelected with the clicked vendor', async () => {
    await setup();
    const spy = vi.fn();
    component.vendorSelected.subscribe(spy);

    const cards = fixture.nativeElement.querySelectorAll('.vendor-card');
    (cards[1] as HTMLButtonElement).click();

    expect(spy).toHaveBeenCalledWith(vendors[1]);
  });
});
