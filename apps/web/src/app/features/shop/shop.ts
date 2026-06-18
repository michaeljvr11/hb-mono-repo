import { Component, OnInit, inject, signal } from '@angular/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CategoryDto, CurrencyCode, ProductDto, VendorDto } from '@hb/shared';
import { CategoriesService } from '../../core/api/categories.service';
import { ProductsService } from '../../core/api/products.service';
import { VendorsService } from '../../core/api/vendors.service';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

interface CategoryWithCount extends CategoryDto {
  productCount: number;
}

@Component({
  selector: 'app-shop',
  imports: [NavBar, Footer, MatSnackBarModule],
  templateUrl: './shop.html',
  styleUrl: './shop.scss',
})
export class Shop implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly vendorsService = inject(VendorsService);
  private readonly snackBar = inject(MatSnackBar);

  // Products
  readonly products = signal<ProductDto[]>([]);
  readonly productsState = signal<LoadState>('loading');

  // Categories with derived product counts
  readonly categories = signal<CategoryWithCount[]>([]);
  readonly categoriesState = signal<LoadState>('loading');

  // Vendors
  readonly vendors = signal<VendorDto[]>([]);
  readonly vendorsState = signal<LoadState>('loading');

  // Newsletter
  readonly newsletterEmail = signal('');

  ngOnInit(): void {
    this.loadProducts();
    this.loadCategories();
    this.loadVendors();
  }

  // ── Price formatting ──────────────────────────────────────────────────────

  formatPrice(price: number, currency: CurrencyCode): string {
    const formatted = new Intl.NumberFormat('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);

    return currency === 'NAD' ? `N$ ${formatted}` : `R ${formatted}`;
  }

  // ── Image resolution ──────────────────────────────────────────────────────

  getPrimaryImage(product: ProductDto): string | null {
    if (!product.images?.length) return null;
    const primary = product.images.find(i => i.isPrimary);
    return primary?.url ?? product.images[0]?.url ?? null;
  }

  getImageAlt(product: ProductDto): string {
    const primary = product.images?.find(i => i.isPrimary) ?? product.images?.[0];
    return primary?.altText ?? product.name;
  }

  // ── Category helpers ──────────────────────────────────────────────────────

  getCategoryIcon(categoryName: string): string {
    const name = categoryName.toLowerCase();
    if (name.includes('agriculture') || name.includes('farm') || name.includes('food')) return 'agriculture';
    if (name.includes('health') || name.includes('beauty') || name.includes('wellness')) return 'spa';
    if (name.includes('textile') || name.includes('fabric') || name.includes('cloth')) return 'checkroom';
    if (name.includes('craft') || name.includes('handmade') || name.includes('art')) return 'palette';
    if (name.includes('electronic') || name.includes('tech')) return 'devices';
    if (name.includes('home') || name.includes('furniture')) return 'chair';
    if (name.includes('sport') || name.includes('outdoor')) return 'sports';
    return 'category';
  }

  // ── Vendor helpers ────────────────────────────────────────────────────────

  getVendorCountry(countryCode: string): string {
    return countryCode === 'ZA' ? 'South Africa' : countryCode === 'NA' ? 'Namibia' : countryCode;
  }

  getVendorInitials(businessName: string): string {
    return businessName
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0] ?? '')
      .join('')
      .toUpperCase();
  }

  // ── Presentational actions ────────────────────────────────────────────────

  addToCart(product: ProductDto): void {
    this.snackBar.open(`Cart is coming soon.`, 'Close', {
      duration: 4000,
      horizontalPosition: 'end',
      panelClass: ['hb-info-snackbar'],
      verticalPosition: 'top',
    });
  }

  onHeroShopNow(): void {
    this.snackBar.open('Product browsing is coming soon.', 'Close', {
      duration: 4000,
      horizontalPosition: 'end',
      panelClass: ['hb-info-snackbar'],
      verticalPosition: 'top',
    });
  }

  onHeroSmeVerification(): void {
    this.snackBar.open('SME Verification is coming soon.', 'Close', {
      duration: 4000,
      horizontalPosition: 'end',
      panelClass: ['hb-info-snackbar'],
      verticalPosition: 'top',
    });
  }

  onNewsletterJoin(): void {
    this.snackBar.open('Newsletter is coming soon.', 'Close', {
      duration: 4000,
      horizontalPosition: 'end',
      panelClass: ['hb-info-snackbar'],
      verticalPosition: 'top',
    });
  }

  // ── Private data loaders ──────────────────────────────────────────────────

  private loadProducts(): void {
    this.productsState.set('loading');
    this.productsService.list().subscribe({
      next: (list) => {
        this.products.set(list);
        this.productsState.set(list.length ? 'loaded' : 'empty');
        // Rebuild category counts once products are known
        this.rebuildCategoryCounts();
      },
      error: () => {
        this.productsState.set('error');
      },
    });
  }

  private loadCategories(): void {
    this.categoriesState.set('loading');
    this.categoriesService.list().subscribe({
      next: (list) => {
        // We set raw data here; counts are merged after products load
        this.categories.set(list.map(c => ({ ...c, productCount: 0 })));
        this.categoriesState.set(list.length ? 'loaded' : 'empty');
        this.rebuildCategoryCounts();
      },
      error: () => {
        this.categoriesState.set('error');
      },
    });
  }

  private loadVendors(): void {
    this.vendorsState.set('loading');
    this.vendorsService.directory().subscribe({
      next: (list) => {
        this.vendors.set(list);
        this.vendorsState.set(list.length ? 'loaded' : 'empty');
      },
      error: () => {
        this.vendorsState.set('error');
      },
    });
  }

  /**
   * Derives product counts per category from the in-memory product list.
   * Called after either products or categories resolve so whichever arrives
   * last triggers the final accurate count.
   */
  private rebuildCategoryCounts(): void {
    const cats = this.categories();
    const prods = this.products();
    if (!cats.length) return;

    const counts = new Map<string, number>();
    for (const product of prods) {
      for (const cat of product.categories ?? []) {
        counts.set(cat.id, (counts.get(cat.id) ?? 0) + 1);
      }
    }

    this.categories.set(
      cats.map(c => ({ ...c, productCount: counts.get(c.id) ?? 0 })),
    );
  }
}
