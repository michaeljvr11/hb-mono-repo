import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AnalyticsEventType,
  CountryCode,
  ProductCategoryDto,
  ProductDto,
  VendorDto,
  VendorSectionType,
} from '@hb/shared';
import { AnalyticsService } from '../../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../../core/analytics/google-analytics.service';
import { AuthService } from '../../../core/auth/auth.service';
import { CartService } from '../../../core/api/cart.service';
import { WishlistService } from '../../../core/api/wishlist.service';
import { ProductsService } from '../../../core/api/products.service';
import { VendorsService } from '../../../core/api/vendors.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { Footer } from '../../../layout/footer/footer';
import { NavBar } from '../../../layout/nav-bar/nav-bar';
import { ProductCard } from '../../../shared/components/product-card/product-card';
import { RadialNav } from '../../../shared/components/radial-nav/radial-nav';
import { ResponsiveImageAttrs, buildResponsiveImage } from '../../../shared/responsive-image';

type VendorState = 'loading' | 'loaded' | 'not-found' | 'error';
type ProductsState = 'loading' | 'loaded' | 'empty' | 'error';

/** A vendor-defined profile section resolved against the vendor's loaded product list. */
interface ResolvedSection {
  id: string;
  title: string;
  products: ProductDto[];
}

/** Server-side max page size — used to avoid truncating a vendor's storefront listings. */
const PRODUCT_LIST_MAX = 100;

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
  imports: [NavBar, Footer, ProductCard, RadialNav, RouterLink],
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
  private readonly wishlistService = inject(WishlistService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly gaService = inject(GoogleAnalyticsService);
  private readonly notificationService = inject(NotificationService);

  /** Real cart count for the radial-nav badge. */
  readonly cartCount = this.cartService.itemCount;

  // Hydration gate: server render and first client render must both show
  // empty hearts (no anonymous-vs-signed-in DOM mismatch) — see nav-bar.ts.
  private readonly hydrated = signal(false);

  /** True once hydrated and the product is on the signed-in user's wishlist. */
  readonly isWishlisted = (productId: string): boolean =>
    this.hydrated() && this.wishlistService.has(productId);

  /** Real wishlist count for the radial-nav badge — 0 until hydrated, same gate as isWishlisted. */
  readonly wishlistCount = computed(() =>
    this.hydrated() ? this.wishlistService.itemCount() : 0,
  );

  readonly vendor = signal<VendorDto | null>(null);
  readonly state = signal<VendorState>('loading');

  readonly products = signal<ProductDto[]>([]);
  readonly productsState = signal<ProductsState>('loading');

  readonly countryLabel = computed(() => {
    const vendor = this.vendor();
    if (!vendor) return '';
    return vendor.countryCode === CountryCode.NAMIBIA ? 'Namibia' : 'South Africa';
  });

  /**
   * `srcset`-ready attrs for the vendor's banner, or `null` when unset. Adapts
   * `VendorDto`'s split shape (canonical URL on `bannerUrl`, derivative metadata
   * nested under `banner`) into the flat `ResponsiveImageSource` shape
   * `buildResponsiveImage` reads — same helper the PDP/product-card use, no
   * vendor-specific variant. `banner` is absent for vendors who haven't
   * re-uploaded since PIO-5 shipped; that's just an absent `variants` key,
   * same as a legacy pre-PIO-2 product row, and renders `bannerUrl` alone.
   */
  readonly bannerImage = computed<ResponsiveImageAttrs | null>(() => {
    const vendor = this.vendor();
    if (!vendor?.bannerUrl) return null;
    return buildResponsiveImage({ url: vendor.bannerUrl, ...vendor.banner });
  });

  /** Same adaptation as `bannerImage`, for the vendor's logo. */
  readonly logoImage = computed<ResponsiveImageAttrs | null>(() => {
    const vendor = this.vendor();
    if (!vendor?.logoUrl) return null;
    return buildResponsiveImage({ url: vendor.logoUrl, ...vendor.logo });
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

  /**
   * Vendor-authored profile sections (curated picks or category pulls), resolved
   * in order against the already-loaded `products()` list — no extra requests.
   * Sections that resolve to zero products are dropped entirely ("an empty
   * section renders nothing rather than an empty shell"). Returns `[]` while
   * products are still loading so the template doesn't flash an empty state.
   */
  readonly resolvedSections = computed<ResolvedSection[]>(() => {
    if (this.productsState() === 'loading') return [];

    const vendor = this.vendor();
    const sections = vendor?.profileSections ?? [];
    if (!sections.length) return [];

    const allProducts = this.products();
    const productsById = new Map(allProducts.map((product) => [product.id, product]));

    const resolved: ResolvedSection[] = [];
    for (const section of sections) {
      let sectionProducts: ProductDto[];
      if (section.type === VendorSectionType.CURATED) {
        sectionProducts = (section.productIds ?? [])
          .map((id) => productsById.get(id))
          .filter((product): product is ProductDto => !!product);
      } else if (section.type === VendorSectionType.CATEGORY) {
        sectionProducts = allProducts.filter((product) =>
          (product.categories ?? []).some((category) => category.id === section.categoryId),
        );
      } else {
        sectionProducts = [];
      }

      if (sectionProducts.length) {
        resolved.push({ id: section.id, title: section.title, products: sectionProducts });
      }
    }
    return resolved;
  });

  /** True once the vendor has at least one non-empty custom profile section. */
  readonly hasCustomSections = computed(() => this.resolvedSections().length > 0);

  /**
   * Products not claimed by any resolved section, rendered in a residual
   * "More from <vendor>" grid so building sections never makes the rest of
   * a vendor's catalogue invisible on their own storefront page.
   */
  readonly unsectionedProducts = computed<ProductDto[]>(() => {
    const claimed = new Set(
      this.resolvedSections().flatMap((section) => section.products.map((product) => product.id)),
    );
    return this.products().filter((product) => !claimed.has(product.id));
  });

  constructor() {
    afterNextRender(() => {
      this.hydrated.set(true);
      // Prime the wishlist once per page load for signed-in users; toggles
      // elsewhere keep the shared WishlistService signal fresh.
      if (this.authService.isLoggedIn() && this.wishlistService.wishlist() === null) {
        this.wishlistService.load().subscribe({ error: () => undefined });
      }
    });

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
    this.productsService.list({ vendorId, limit: PRODUCT_LIST_MAX }).subscribe({
      next: (res) => {
        this.products.set(res.items);
        this.productsState.set(res.items.length ? 'loaded' : 'empty');
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
        this.notificationService
          .success(`Added '${product.name}' to your cart.`, 'View cart')
          .onAction()
          .subscribe(() => void this.router.navigate(['/cart']));
      },
      error: (err: { error?: { message?: string } }) => {
        this.notificationService.error(err?.error?.message ?? 'Could not add this item to your cart.');
      },
    });
  }

  onWishlistToggle(product: ProductDto): void {
    if (!this.authService.isLoggedIn()) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    // No optimistic mutation — the heart only reflects a successful server
    // response (via WishlistService's signal), so a failure can never leave
    // it lying about the real state.
    this.wishlistService.toggle(product.id).subscribe({
      error: (err: { error?: { message?: string } }) => {
        this.notificationService.error(err?.error?.message ?? 'Could not update your wishlist.');
      },
    });
  }
}
