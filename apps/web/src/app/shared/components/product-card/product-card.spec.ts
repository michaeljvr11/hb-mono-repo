import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { CountryCode, CurrencyCode, ListingType, ProductDto } from '@hb/shared';

import { ProductCard } from './product-card';

describe('ProductCard', () => {
  let fixture: ComponentFixture<ProductCard>;
  let component: ProductCard;

  const baseProduct: ProductDto = {
    id: 'p1',
    name: 'Organic Fynbos Honey 500g',
    description: 'Raw honey from the Western Cape.',
    price: 145,
    currency: CurrencyCode.ZAR,
    stockQuantity: 10,
    originCountry: CountryCode.SOUTH_AFRICA,
    listingType: ListingType.VENDOR,
    images: [{ id: 'img1', url: 'http://a.com/honey.jpg', isPrimary: true, displayOrder: 0 }],
    vendor: { id: 'v1', businessName: 'Leko Organics' },
    categories: [{ id: 'c1', name: 'Agriculture' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  async function setup(product: ProductDto = baseProduct): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ProductCard],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductCard);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('product', product);
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('renders the product name, category and formatted price', async () => {
    await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Organic Fynbos Honey 500g');
    expect(el.textContent).toContain('Agriculture');
    expect(el.textContent).toContain('R ');
    expect(el.textContent?.replace(/[^\d]/g, '')).toContain('14500');
  });

  it('renders the primary image with alt text', async () => {
    await setup();
    const img = fixture.nativeElement.querySelector('.product-card__image') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe('http://a.com/honey.jpg');
  });

  it('renders a placeholder block when the product has no images', async () => {
    await setup({ ...baseProduct, images: [] });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.product-card__image')).toBeNull();
    expect(el.querySelector('.product-card__placeholder')).toBeTruthy();
  });

  it('applies the carousel modifier class for the carousel variant', async () => {
    await setup();
    fixture.componentRef.setInput('variant', 'carousel');
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.product-card');
    expect(card.classList.contains('product-card--carousel')).toBe(true);
  });

  it('emits addToCart with the product on button click', async () => {
    await setup();
    const spy = vi.fn();
    component.addToCart.subscribe(spy);

    const button = fixture.nativeElement.querySelector('.product-card__cart-btn') as HTMLButtonElement;
    button.click();

    expect(spy).toHaveBeenCalledWith(baseProduct);
  });

  it('does not trigger router navigation when the add-to-cart button is clicked', async () => {
    await setup();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const button = fixture.nativeElement.querySelector('.product-card__cart-btn') as HTMLButtonElement;
    button.click();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('links the card to the product detail route', async () => {
    await setup();
    const anchor = fixture.nativeElement.querySelector('a.product-card') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/products/p1');
  });

  // ── Wishlist affordance ──────────────────────────────────────────────

  it('renders an outline heart with "Add to wishlist" when not wishlisted (default)', async () => {
    await setup();
    const btn = fixture.nativeElement.querySelector(
      '.product-card__wishlist-btn',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.classList.contains('product-card__wishlist-btn--active')).toBe(false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.getAttribute('aria-label')).toBe('Add to wishlist');
  });

  it('renders a filled heart with "Remove from wishlist" when wishlisted', async () => {
    await setup();
    fixture.componentRef.setInput('wishlisted', true);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector(
      '.product-card__wishlist-btn',
    ) as HTMLButtonElement;
    expect(btn.classList.contains('product-card__wishlist-btn--active')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Remove from wishlist');
  });

  it('emits wishlistToggle with the product on heart click', async () => {
    await setup();
    const spy = vi.fn();
    component.wishlistToggle.subscribe(spy);

    const btn = fixture.nativeElement.querySelector(
      '.product-card__wishlist-btn',
    ) as HTMLButtonElement;
    btn.click();

    expect(spy).toHaveBeenCalledWith(baseProduct);
  });

  it('does not trigger router navigation when the wishlist heart is clicked', async () => {
    await setup();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const btn = fixture.nativeElement.querySelector(
      '.product-card__wishlist-btn',
    ) as HTMLButtonElement;
    btn.click();

    expect(navigate).not.toHaveBeenCalled();
  });
});
