import { isPlatformBrowser, Location } from '@angular/common';
import {
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { switchMap } from 'rxjs';
import { AnalyticsEventType, ProductDto } from '@hb/shared';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/api/cart.service';
import { ProductsService } from '../../core/api/products.service';
import { formatPrice } from '../../shared/format-price';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { ProductCard } from '../../shared/components/product-card/product-card';
import { RadialNav } from '../../shared/components/radial-nav/radial-nav';

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

/** Number of related products shown in "You May Also Like". */
const RELATED_LIMIT = 4;

/**
 * Product detail page (PDP). Fetches the product by the `:id` route param
 * (works during SSR — plain HttpClient relative URL, same pattern as every
 * other public catalogue service). A 404 from the API renders a friendly
 * not-found state rather than propagating the error.
 */
@Component({
  selector: 'app-product-detail',
  imports: [NavBar, Footer, MatSnackBarModule, ProductCard, RadialNav, RouterLink],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss',
})
export class ProductDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly productsService = inject(ProductsService);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly gaService = inject(GoogleAnalyticsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly platformId = inject(PLATFORM_ID);

  /** Real cart count for the radial-nav badge. */
  readonly cartCount = this.cartService.itemCount;

  private readonly productId = toSignal(
    this.route.paramMap.pipe(switchMap((params) => [params.get('id')])),
    { initialValue: null },
  );

  readonly product = signal<ProductDto | null>(null);
  readonly state = signal<LoadState>('loading');

  readonly relatedProducts = signal<ProductDto[]>([]);

  // ── Image gallery ───────────────────────────────────────────────────────
  readonly activeImageIndex = signal(0);

  readonly images = computed(() => this.product()?.images ?? []);

  readonly activeImage = computed(() => {
    const imgs = this.images();
    return imgs[this.activeImageIndex()] ?? imgs[0] ?? null;
  });

  readonly hasMultipleImages = computed(() => this.images().length > 1);

  // ── Derived display data ─────────────────────────────────────────────────
  readonly priceLabel = computed(() => {
    const p = this.product();
    if (!p) return '';
    return formatPrice(p.price, p.currency);
  });

  readonly isVendorListing = computed(() => !!this.product()?.vendor);

  readonly vendorInitials = computed(() => {
    const name = this.product()?.vendor?.businessName;
    if (!name) return '';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase();
  });

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) {
        this.state.set('not-found');
        return;
      }
      this.loadProduct(id);
    });
  }

  private loadProduct(id: string): void {
    this.state.set('loading');
    this.activeImageIndex.set(0);
    this.productsService.getById(id).subscribe({
      next: (product) => {
        this.product.set(product);
        this.state.set('loaded');
        this.analyticsService.track(AnalyticsEventType.PRODUCT_VIEWED, {
          productId: product.id,
          vendorId: product.vendor?.id,
        });
        this.gaService.viewItem(product.id, product.name, product.price, product.currency);
        this.loadRelated(product);
      },
      error: (err) => {
        this.product.set(null);
        this.state.set(err?.status === 404 ? 'not-found' : 'error');
      },
    });
  }

  private loadRelated(product: ProductDto): void {
    const categoryId = product.categories?.[0]?.id;
    if (!categoryId) {
      this.relatedProducts.set([]);
      return;
    }
    this.productsService.list({ categoryId }).subscribe({
      next: (res) => {
        this.relatedProducts.set(
          res.items.filter((p) => p.id !== product.id).slice(0, RELATED_LIMIT),
        );
      },
      error: () => this.relatedProducts.set([]),
    });
  }

  // ── Gallery controls ─────────────────────────────────────────────────────

  nextImage(): void {
    const count = this.images().length;
    if (count <= 1) return;
    this.activeImageIndex.set((this.activeImageIndex() + 1) % count);
  }

  prevImage(): void {
    const count = this.images().length;
    if (count <= 1) return;
    this.activeImageIndex.set((this.activeImageIndex() - 1 + count) % count);
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  goBack(): void {
    if (isPlatformBrowser(this.platformId) && window.history.length > 1) {
      this.location.back();
      return;
    }
    void this.router.navigate(['/discover']);
  }

  viewStorefront(): void {
    const vendorId = this.product()?.vendor?.id;
    if (!vendorId) return;
    void this.router.navigate(['/vendors', vendorId]);
  }

  onAddToCart(): void {
    const product = this.product();
    if (!product) return;
    this.addProductToCart(product);
  }

  onRelatedAddToCart(product: ProductDto): void {
    this.addProductToCart(product);
  }

  private addProductToCart(product: ProductDto): void {
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
