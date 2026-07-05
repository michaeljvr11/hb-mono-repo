import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import type { AuthUser, UserDto } from '@hb/shared';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CountryCode,
  CurrencyCode,
  ListingType,
  ProductDto,
} from '@hb/shared';

import { ProductDetail } from './product-detail';
import { ProductsService } from '../../core/api/products.service';
import { AuthService } from '../../core/auth/auth.service';

// ─── Mock data ───────────────────────────────────────────────────────────────

const HONEY: ProductDto = {
  id: 'p1',
  name: 'Organic Fynbos Honey 500g',
  description: 'Sourced from the Western Cape.\nRich in antioxidants.',
  price: 145,
  currency: CurrencyCode.ZAR,
  stockQuantity: 10,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.VENDOR,
  images: [
    { id: 'img1', url: 'http://a.com/1.jpg', isPrimary: true, displayOrder: 0 },
    { id: 'img2', url: 'http://a.com/2.jpg', isPrimary: false, displayOrder: 1 },
  ],
  vendor: { id: 'v1', businessName: 'Leko Organics' },
  categories: [{ id: 'cat-1', name: 'Agriculture' }],
  createdAt: '',
  updatedAt: '',
};

const RELATED_SAME_CATEGORY: ProductDto = {
  ...HONEY,
  id: 'p2',
  name: 'Wild Rooibos Loose Tea',
};

const PLATFORM_PRODUCT: ProductDto = {
  id: 'p3',
  name: 'Platform Widget',
  description: 'No vendor here.',
  price: 50,
  currency: CurrencyCode.ZAR,
  stockQuantity: 20,
  originCountry: CountryCode.SOUTH_AFRICA,
  listingType: ListingType.PLATFORM,
  images: [],
  categories: [],
  createdAt: '',
  updatedAt: '',
};

// ─── Stub interfaces ──────────────────────────────────────────────────────────

interface ProductsStub {
  getById: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
}

interface AuthStub {
  isLoggedIn: ReturnType<typeof vi.fn>;
  currentUser$: BehaviorSubject<AuthUser | UserDto | null>;
}

function makeStubs(): { productsStub: ProductsStub; authStub: AuthStub } {
  return {
    productsStub: {
      getById: vi.fn(() => of(HONEY)),
      list: vi.fn(() => of([HONEY, RELATED_SAME_CATEGORY])),
    },
    authStub: {
      isLoggedIn: vi.fn(() => false),
      currentUser$: new BehaviorSubject<AuthUser | UserDto | null>(null),
    },
  };
}

async function setupTestBed(
  productsStub: ProductsStub,
  authStub: AuthStub,
  paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>,
): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [ProductDetail],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      provideRouter([]),
      { provide: ProductsService, useValue: productsStub },
      { provide: AuthService, useValue: authStub },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: paramMap$ },
      },
    ],
  }).compileComponents();
}

// ─── Main suite ───────────────────────────────────────────────────────────────

describe('ProductDetail', () => {
  let fixture: ComponentFixture<ProductDetail>;
  let component: ProductDetail;
  let router: Router;
  let productsStub: ProductsStub;
  let authStub: AuthStub;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    ({ productsStub, authStub } = makeStubs());
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'p1' }));

    await setupTestBed(productsStub, authStub, paramMap$);

    fixture = TestBed.createComponent(ProductDetail);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('fetches the product by the :id route param', () => {
    expect(productsStub.getById).toHaveBeenCalledWith('p1');
  });

  it('renders the product name and price', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Organic Fynbos Honey 500g');
    expect(el.textContent).toMatch(/R\s?145[.,]00/);
  });

  it('renders the cross-border shipping section', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Cross-Border Shipping');
    expect(el.textContent).toContain('Arrives in 3-5 business days');
    expect(el.textContent).toContain('Simplified Customs Included');
  });

  it('renders the description as multiple paragraphs', () => {
    const el: HTMLElement = fixture.nativeElement;
    const paragraphs = el.querySelectorAll('.pdp__description p');
    expect(paragraphs.length).toBe(2);
  });

  it('renders the vendor card with initials, name and verified badge when a vendor exists', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.pdp__vendor-card')).toBeTruthy();
    expect(el.textContent).toContain('Leko Organics');
    expect(el.querySelector('.pdp__vendor-avatar')?.textContent?.trim()).toBe('LO');
  });

  it('omits the vendor card for platform (vendor-less) listings', async () => {
    productsStub.getById.mockReturnValue(of(PLATFORM_PRODUCT));
    paramMap$.next(convertToParamMap({ id: 'p3' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.pdp__vendor-card')).toBeNull();
  });

  it('shows the "1 / N" badge and prev/next controls when there are multiple images', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('1 / 2');
    expect(el.querySelector('.pdp__hero-nav--prev')).toBeTruthy();
    expect(el.querySelector('.pdp__hero-nav--next')).toBeTruthy();
  });

  it('cycles images forward and wraps around on nextImage()', () => {
    expect(component.activeImageIndex()).toBe(0);
    component.nextImage();
    expect(component.activeImageIndex()).toBe(1);
    component.nextImage();
    expect(component.activeImageIndex()).toBe(0);
  });

  it('fetches related products by the first category, excluding self, capped at 4', () => {
    expect(productsStub.list).toHaveBeenCalledWith({ categoryId: 'cat-1' });
    expect(component.relatedProducts().length).toBe(1);
    expect(component.relatedProducts()[0].id).toBe('p2');
    expect(component.relatedProducts().some((p) => p.id === 'p1')).toBe(false);
  });

  it('renders a friendly not-found state on a 404', async () => {
    productsStub.getById.mockReturnValue(throwError(() => ({ status: 404 })));
    paramMap$.next(convertToParamMap({ id: 'missing' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("We couldn't find that product.");
    expect(el.querySelector('a.pdp__back-link')).toBeTruthy();
  });

  it('renders a generic error state on a non-404 failure', async () => {
    productsStub.getById.mockReturnValue(throwError(() => ({ status: 500 })));
    paramMap$.next(convertToParamMap({ id: 'boom' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Could not load this product right now');
  });

  it('anonymous add-to-cart routes to /login with the current returnUrl', () => {
    authStub.isLoggedIn.mockReturnValue(false);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onAddToCart();

    expect(navigateSpy).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: router.url },
    });
  });

  it('authenticated add-to-cart does not navigate (shows a coming-soon snackbar instead)', () => {
    authStub.isLoggedIn.mockReturnValue(true);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onAddToCart();

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('viewStorefront navigates to /discover with the vendor id as a query param', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.viewStorefront();
    expect(navigateSpy).toHaveBeenCalledWith(['/discover'], { queryParams: { vendorId: 'v1' } });
  });
});
