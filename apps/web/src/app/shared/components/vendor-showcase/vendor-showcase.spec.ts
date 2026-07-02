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

  it('renders one card per vendor with name and location', async () => {
    await setup();
    const cards = fixture.nativeElement.querySelectorAll('.vendor-card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Roots & Shoots Art');
    expect(cards[0].textContent).toContain('South Africa');
    expect(cards[1].textContent).toContain('Leko Organics');
    expect(cards[1].textContent).toContain('Namibia');
  });

  it('shows the verified badge only for approved vendors', async () => {
    await setup();
    const cards = fixture.nativeElement.querySelectorAll('.vendor-card');
    expect(cards[0].querySelector('.vendor-card__verified')).toBeTruthy();
    expect(cards[1].querySelector('.vendor-card__verified')).toBeNull();
  });

  it('renders 5 static rating stars per vendor', async () => {
    await setup();
    const cards = fixture.nativeElement.querySelectorAll('.vendor-card');
    expect(cards[0].querySelectorAll('.vendor-card__star').length).toBe(5);
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
