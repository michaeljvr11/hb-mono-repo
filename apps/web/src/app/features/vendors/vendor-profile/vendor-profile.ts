import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AnalyticsEventType, CountryCode, ProductCategoryDto, ProductDto, VendorDto } from '@hb/shared';
import { AnalyticsService } from '../../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../../core/analytics/google-analytics.service';
import { AuthService } from '../../../core/auth/auth.service';
import { CartService } from '../../../core/api/cart.service';
import { ProductsService } from '../../../core/api/products.service';
import { VendorsService } from '../../../core/api/vendors.service';
import { Footer } from '../../../layout/footer/footer';
import { NavBar } from '../../../layout/nav-bar/nav-bar';
import { ProductCard } from '../../../shared/components/product-card/product-card';
import { RadialNav } from '../../../shared/components/radial-nav/radial-nav';

type VendorState = 'loading' | 'loaded' | 'not-found' | 'error';
type ProductsState = 'loading' | 'loaded' | 'empty' | 'error';

/**
 * Public vendor profile / storefront page (`/vendors/:id`). Fetches the
 * vendor by the `:id` route param (works during SSR — plain HttpClient
 * relative URL, same pattern as the PDP). The public `GET /vendors/:id`
 * endpoint only ever returns APPROVED vendors, so every vendor rendered
 * here is implicitly verified — a 404 (unknown or non-approved id) renders
 * a friendly not-found state rather than propagating the error.
 */
@Component({
  selector: 'app-vendor-profile',
  imports: [NavBar, Footer, MatSnackBarModule, ProductCard, RadialNav, RouterLink],
  templateUrl: './vendor-profile.html',
  styleUrl: './vendor-profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicVendorProfile {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly vendorsService = inject(VendorsService);
  private readonly productsService = inject(ProductsService);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly gaService = inject(GoogleAnalyticsService);
  private readonly snackBar = inject(MatSnackBar);

  /** Real cart count for the radial-nav badge. */
  readonly cartCount = this.cartService.itemCount;

  readonly vendor = signal<VendorDto | null>(null);
  readonly state = signal<VendorState>('loading');

  readonly products = signal<ProductDto[]>([]);
  readonly productsState = signal<ProductsState>('loading');

  readonly countryLabel = computed(() => {
    const vendor = this.vendor();
    if (!vendor) return '';
    return vendor.countryCode === CountryCode.NAMIBIA ? 'Namibia' : 'South Africa';
  });

  /** Distinct product categories across the vendor's loaded products, de-duped by id. */
  readonly categoryChips = computed<ProductCategoryDto[]>(() => {
    const seen = new Map<string, ProductCategoryDto>();
    for (const product of this.products()) {
      for (const category of product.categories ?? []) {
        if (!seen.has(category.id)) {
          seen.set(category.id, category);
        }
      }
    }
    return Array.from(seen.values());
  });

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) {
        this.state.set('not-found');
        return;
      }
      this.loadVendor(id);
    });
  }

  private loadVendor(id: string): void {
    this.state.set('loading');
    this.vendor.set(null);
    this.products.set([]);
    this.productsState.set('loading');

    this.vendorsService.getById(id).subscribe({
      next: (vendor) => {
        this.vendor.set(vendor);
        this.state.set('loaded');
        this.loadProducts(id);
      },
      error: (err) => {
        this.vendor.set(null);
        this.state.set(err?.status === 404 ? 'not-found' : 'error');
      },
    });
  }

  private loadProducts(vendorId: string): void {
    this.productsState.set('loading');
    this.productsService.list({ vendorId }).subscribe({
      next: (list) => {
        this.products.set(list);
        this.productsState.set(list.length ? 'loaded' : 'empty');
      },
      error: () => {
        this.products.set([]);
        this.productsState.set('error');
      },
    });
  }

  onAddToCart(product: ProductDto): void {
    if (!this.authService.isLoggedIn()) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    this.cartService.addItem(product.id).subscribe({
      next: () => {
        this.analyticsService.track(AnalyticsEventType.ADD_TO_CART, {
          productId: product.id,
          vendorId: product.vendor?.id,
        });
        this.gaService.addToCart(product.id, product.name, product.price, product.currency);
        this.snackBar
          .open(`Added '${product.name}' to your cart.`, 'View cart', {
            duration: 4000,
            horizontalPosition: 'end',
            panelClass: ['hb-info-snackbar'],
            verticalPosition: 'top',
          })
          .onAction()
          .subscribe(() => void this.router.navigate(['/cart']));
      },
      error: (err: { error?: { message?: string } }) => {
        this.snackBar.open(
          err?.error?.message ?? 'Could not add this item to your cart.',
          'Close',
          {
            duration: 5000,
            horizontalPosition: 'end',
            panelClass: ['hb-error-snackbar'],
            verticalPosition: 'top',
          },
        );
      },
    });
  }
}
