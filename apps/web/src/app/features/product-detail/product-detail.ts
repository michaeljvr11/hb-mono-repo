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
import { ProductDto } from '@hb/shared';
import { AuthService } from '../../core/auth/auth.service';
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
  private readonly snackBar = inject(MatSnackBar);
  private readonly platformId = inject(PLATFORM_ID);

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
      next: (list) => {
        this.relatedProducts.set(
          list.filter((p) => p.id !== product.id).slice(0, RELATED_LIMIT),
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
    void this.router.navigate(['/discover'], { queryParams: { vendorId } });
  }

  onAddToCart(): void {
    if (!this.authService.isLoggedIn()) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    this.snackBar.open('Cart is coming soon.', 'Close', {
      duration: 4000,
      horizontalPosition: 'end',
      panelClass: ['hb-info-snackbar'],
      verticalPosition: 'top',
    });
  }

  onRelatedAddToCart(_product: ProductDto): void {
    this.onAddToCart();
  }
}
