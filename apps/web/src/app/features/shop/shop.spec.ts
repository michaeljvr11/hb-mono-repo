import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import { Shop, deriveCategoryCounts, CategoryWithCount } from './shop';
import { ProductDto } from '@hb/shared';

describe('Shop', () => {
  let component: Shop;
  let fixture: ComponentFixture<Shop>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Shop],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Shop);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the "New in Namibia" section heading', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('New in Namibia');
  });

  it('renders the "Explore Categories" section heading', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Explore Categories');
  });

  it('renders the "Featured SME Vendors" section heading', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Featured SME Vendors');
  });

  it('formats ZAR prices with the R prefix', () => {
    const result = component.formatPrice(1250, 'ZAR');
    expect(result).toMatch(/^R\s/);
    expect(result).toContain('250');
  });

  it('formats NAD prices with the N$ prefix', () => {
    const result = component.formatPrice(399, 'NAD');
    expect(result).toMatch(/^N\$\s/);
    expect(result).toContain('399');
  });

  it('returns null for a product with no images', () => {
    const product = { images: [] } as never;
    expect(component.getPrimaryImage(product)).toBeNull();
  });

  it('returns the primary image url when present', () => {
    const product = {
      images: [
        { id: '1', url: 'http://a.com/img.jpg', isPrimary: true, displayOrder: 0 },
      ],
    } as never;
    expect(component.getPrimaryImage(product)).toBe('http://a.com/img.jpg');
  });

  it('maps ZA countryCode to "South Africa"', () => {
    expect(component.getVendorCountry('ZA')).toBe('South Africa');
  });

  it('maps NA countryCode to "Namibia"', () => {
    expect(component.getVendorCountry('NA')).toBe('Namibia');
  });

  it('derives vendor initials from business name', () => {
    expect(component.getVendorInitials('Roots Shoots')).toBe('RS');
  });
});

describe('deriveCategoryCounts', () => {
  const categories = [
    { id: 'c1', name: 'Agriculture', displayOrder: 0, productCount: 0 },
    { id: 'c2', name: 'Handicrafts', displayOrder: 1, productCount: 0 },
    { id: 'c3', name: 'Textiles', displayOrder: 2, productCount: 0 },
  ] as CategoryWithCount[];

  it('counts each category, including products that span multiple categories', () => {
    const products = [
      { id: 'p1', categories: [{ id: 'c1' }, { id: 'c2' }] },
      { id: 'p2', categories: [{ id: 'c1' }] },
    ] as unknown as ProductDto[];

    const result = deriveCategoryCounts(categories, products);

    expect(result.find((c) => c.id === 'c1')?.productCount).toBe(2);
    expect(result.find((c) => c.id === 'c2')?.productCount).toBe(1);
    // c3 has no products → 0, never undefined
    expect(result.find((c) => c.id === 'c3')?.productCount).toBe(0);
  });

  it('returns zero counts when there are no products', () => {
    const result = deriveCategoryCounts(categories, []);
    expect(result.every((c) => c.productCount === 0)).toBe(true);
  });
});
