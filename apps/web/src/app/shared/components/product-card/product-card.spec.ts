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

  it('renders a plain src with no srcset/width/height for a legacy image with no variants', async () => {
    await setup();
    const img = fixture.nativeElement.querySelector('.product-card__image') as HTMLImageElement;
    expect(img.getAttribute('srcset')).toBeNull();
    expect(img.hasAttribute('width')).toBe(false);
    expect(img.hasAttribute('height')).toBe(false);
  });

  it('renders srcset, sizes, width and height from the variant set when present', async () => {
    await setup({
      ...baseProduct,
      images: [
        {
          id: 'img1',
          url: 'http://a.com/honey-full.webp',
          isPrimary: true,
          displayOrder: 0,
          width: 2000,
          height: 2000,
          sizeBytes: 12345,
          variants: {
            thumbnail: { url: 'http://a.com/honey-thumb.webp', width: 300, height: 300, sizeBytes: 100 },
            card: { url: 'http://a.com/honey-card.webp', width: 800, height: 800, sizeBytes: 500 },
            full: { url: 'http://a.com/honey-full.webp', width: 2000, height: 2000, sizeBytes: 12345 },
          },
        },
      ],
    });
    const img = fixture.nativeElement.querySelector('.product-card__image') as HTMLImageElement;
    expect(img.src).toBe('http://a.com/honey-full.webp');
    expect(img.getAttribute('srcset')).toBe(
      'http://a.com/honey-thumb.webp 300w, http://a.com/honey-card.webp 800w, http://a.com/honey-full.webp 2000w',
    );
    expect(img.getAttribute('sizes')).toBe('(min-width: 768px) 280px, 260px');
    expect(img.getAttribute('width')).toBe('2000');
    expect(img.getAttribute('height')).toBe('2000');
  });

  it('uses the fixed 160px sizes string for the carousel variant', async () => {
    await setup({
      ...baseProduct,
      images: [
        {
          id: 'img1',
          url: 'http://a.com/honey-full.webp',
          isPrimary: true,
          displayOrder: 0,
          variants: {
            thumbnail: { url: 'http://a.com/honey-thumb.webp', width: 300, height: 300, sizeBytes: 100 },
          },
        },
      ],
    });
    fixture.componentRef.setInput('variant', 'carousel');
    fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('.product-card__image') as HTMLImageElement;
    expect(img.getAttribute('sizes')).toBe('160px');
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

  // ── Sizing available hint + quick-add behavior (Product Sizing) ────────

  const sizedProduct: ProductDto = {
    ...baseProduct,
    id: 'p-sized',
    sizes: [
      { id: 's1', label: 'Small', stockQuantity: 5, displayOrder: 0 },
      { id: 's2', label: 'Medium', stockQuantity: 0, displayOrder: 1 },
    ],
  };

  it('does not render the "Sizing available" hint for an unsized product', async () => {
    await setup();
    expect(fixture.nativeElement.querySelector('.product-card__size-hint')).toBeNull();
  });

  it('renders the "Sizing available" hint when the product has sizes', async () => {
    await setup(sizedProduct);
    const hint = fixture.nativeElement.querySelector('.product-card__size-hint');
    expect(hint).toBeTruthy();
    expect(hint.textContent).toContain('Sizing available');
  });

  it('does not emit addToCart for a sized product — lets the click fall through to the PDP link instead', async () => {
    await setup(sizedProduct);
    // The click is expected to fall through and trigger the wrapping <a>'s
    // routerLink navigation — stub it out so this test only asserts on
    // addToCart, not on an actual (unrouted, in this fixture) navigation.
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const spy = vi.fn();
    component.addToCart.subscribe(spy);

    const button = fixture.nativeElement.querySelector('.product-card__cart-btn') as HTMLButtonElement;
    button.click();

    expect(spy).not.toHaveBeenCalled();
  });

  it('still emits addToCart on click for an unsized product (regression: existing behaviour unchanged)', async () => {
    await setup();
    const spy = vi.fn();
    component.addToCart.subscribe(spy);

    const button = fixture.nativeElement.querySelector('.product-card__cart-btn') as HTMLButtonElement;
    button.click();

    expect(spy).toHaveBeenCalledWith(baseProduct);
  });

  it('uses a "select a size" aria-label and distinct icon for the quick-add button on a sized product', async () => {
    await setup(sizedProduct);
    const button = fixture.nativeElement.querySelector('.product-card__cart-btn') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe(`Select a size for ${sizedProduct.name}`);
    expect(button.querySelector('.material-symbols-outlined')?.textContent).toBe('straighten');
  });
});
