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
    expect(img.getAttribute('sizes')).toBe('(min-width: 768px) 220px, 50vw');
    expect(img.getAttribute('width')).toBe('2000');
    expect(img.getAttribute('height')).toBe('2000');
  });

  it('uses the carousel track sizes string for the carousel variant', async () => {
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
    expect(img.getAttribute('sizes')).toBe('(min-width: 768px) 220px, 170px');
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
  // ── Phase 3: seller identity, origin, stock, rating and sale slots ─────

  it('names the vendor with the origin chip for a marketplace listing', async () => {
    await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.product-card__seller-name')?.textContent).toBe('Leko Organics');
    const origin = el.querySelector('.product-card__origin') as HTMLElement;
    expect(origin.textContent?.trim()).toBe('ZA');
    expect(origin.getAttribute('aria-label')).toBe('Ships from South Africa');
  });

  it('says "Sold by H&B" for a platform listing with no vendor', async () => {
    await setup({ ...baseProduct, vendor: undefined, listingType: ListingType.PLATFORM });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.product-card__seller-name')?.textContent).toBe('Sold by H&B');
    expect(el.querySelector('.product-card__seller-icon')?.textContent).toBe('verified');
  });

  it('labels a Namibian origin', async () => {
    await setup({ ...baseProduct, originCountry: CountryCode.NAMIBIA });
    const origin = fixture.nativeElement.querySelector('.product-card__origin') as HTMLElement;
    expect(origin.textContent?.trim()).toBe('NA');
    expect(origin.getAttribute('aria-label')).toBe('Ships from Namibia');
  });

  it('shows "In stock" above the low-stock threshold', async () => {
    await setup();
    const stock = fixture.nativeElement.querySelector('.product-card__stock') as HTMLElement;
    expect(stock.textContent).toContain('In stock');
    expect(stock.classList.contains('product-card__stock--low')).toBe(false);
  });

  it('shows "Only N left" at or below five units', async () => {
    await setup({ ...baseProduct, stockQuantity: 3 });
    const stock = fixture.nativeElement.querySelector('.product-card__stock') as HTMLElement;
    expect(stock.textContent).toContain('Only 3 left');
    expect(stock.classList.contains('product-card__stock--low')).toBe(true);
  });

  it('sums stock across sizes for a sized product', async () => {
    await setup({
      ...sizedProduct,
      stockQuantity: 0,
      sizes: [
        { id: 's1', label: 'S', stockQuantity: 2, displayOrder: 0 },
        { id: 's2', label: 'M', stockQuantity: 2, displayOrder: 1 },
      ],
    });
    expect(component.stockTotal()).toBe(4);
    expect(fixture.nativeElement.querySelector('.product-card__stock')?.textContent).toContain('Only 4 left');
  });

  it('marks a sold-out product: badge, disabled quick-add and no addToCart emit', async () => {
    await setup({ ...baseProduct, stockQuantity: 0 });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.product-card')?.classList.contains('product-card--sold-out')).toBe(true);
    expect(el.querySelector('.product-card__badge--muted')?.textContent).toBe('Sold out');
    expect(el.querySelector('.product-card__stock')?.textContent).toContain('Sold out');

    const button = el.querySelector('.product-card__cart-btn') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-label')).toBe(`${baseProduct.name} is sold out`);

    const spy = vi.fn();
    component.addToCart.subscribe(spy);
    component.onAddToCart(new Event('click'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('renders no rating slot when the product carries no rating fields (today)', async () => {
    await setup();
    expect(fixture.nativeElement.querySelector('.product-card__rating')).toBeNull();
  });

  it('renders the rating slot when averageRating and reviewCount are present', async () => {
    await setup({ ...baseProduct, averageRating: 4.63, reviewCount: 128 } as ProductDto);
    const rating = fixture.nativeElement.querySelector('.product-card__rating') as HTMLElement;
    expect(rating).toBeTruthy();
    expect(rating.textContent).toContain('4.6');
    expect(rating.textContent).toContain('(128)');
    expect(rating.getAttribute('aria-label')).toBe('Rated 4.6 out of 5 from 128 reviews');
  });

  it('hides the rating when reviewCount is zero', async () => {
    await setup({ ...baseProduct, averageRating: 5, reviewCount: 0 } as ProductDto);
    expect(fixture.nativeElement.querySelector('.product-card__rating')).toBeNull();
  });

  it('renders no sale slot without a compareAtPrice (today)', async () => {
    await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.product-card__compare-at')).toBeNull();
    expect(el.querySelector('.product-card__badge--sale')).toBeNull();
    expect(el.querySelector('.product-card__price')?.classList.contains('product-card__price--sale')).toBe(false);
  });

  it('renders the sale slot when compareAtPrice exceeds price', async () => {
    await setup({ ...baseProduct, price: 120, compareAtPrice: 160 } as ProductDto);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.product-card__compare-at')?.textContent).toContain('R 160');
    expect(el.querySelector('.product-card__badge--sale')?.textContent).toContain('25%');
    expect(el.querySelector('.product-card__price')?.classList.contains('product-card__price--sale')).toBe(true);
  });

  it('ignores a compareAtPrice that is not above the price', async () => {
    await setup({ ...baseProduct, price: 160, compareAtPrice: 160 } as ProductDto);
    expect(fixture.nativeElement.querySelector('.product-card__compare-at')).toBeNull();
  });

  // ── Phase 3: hover image + press states ───────────────────────────────

  it('renders no secondary image for a single-image product', async () => {
    await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.product-card__image--alt')).toBeNull();
    expect(el.querySelector('.product-card')?.classList.contains('product-card--has-alt')).toBe(false);
  });

  it('renders the first non-primary image as the hover alternate', async () => {
    await setup({
      ...baseProduct,
      images: [
        { id: 'b', url: 'http://a.com/b.jpg', isPrimary: false, displayOrder: 1 },
        { id: 'a', url: 'http://a.com/a.jpg', isPrimary: true, displayOrder: 0 },
        { id: 'c', url: 'http://a.com/c.jpg', isPrimary: false, displayOrder: 2 },
      ],
    });
    const el: HTMLElement = fixture.nativeElement;
    const primary = el.querySelector('.product-card__image:not(.product-card__image--alt)') as HTMLImageElement;
    const alt = el.querySelector('.product-card__image--alt') as HTMLImageElement;
    expect(primary.src).toBe('http://a.com/a.jpg');
    expect(alt.src).toBe('http://a.com/b.jpg');
    expect(alt.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.product-card')?.classList.contains('product-card--has-alt')).toBe(true);
  });

  it('holds the "added" state with a check icon for 900ms after a quick-add', async () => {
    vi.useFakeTimers();
    try {
      await setup();
      const button = fixture.nativeElement.querySelector('.product-card__cart-btn') as HTMLButtonElement;
      button.click();
      fixture.detectChanges();
      expect(button.classList.contains('product-card__cart-btn--added')).toBe(true);
      expect(button.querySelector('.material-symbols-outlined')?.textContent).toBe('check');

      vi.advanceTimersByTime(899);
      fixture.detectChanges();
      expect(button.classList.contains('product-card__cart-btn--added')).toBe(true);

      vi.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(button.classList.contains('product-card__cart-btn--added')).toBe(false);
      expect(button.querySelector('.material-symbols-outlined')?.textContent).toBe('add_shopping_cart');
    } finally {
      vi.useRealTimers();
    }
  });

  it('pops the wishlist heart briefly on toggle', async () => {
    vi.useFakeTimers();
    try {
      await setup();
      const btn = fixture.nativeElement.querySelector('.product-card__wishlist-btn') as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      expect(btn.classList.contains('product-card__wishlist-btn--pop')).toBe(true);

      vi.advanceTimersByTime(400);
      fixture.detectChanges();
      expect(btn.classList.contains('product-card__wishlist-btn--pop')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
