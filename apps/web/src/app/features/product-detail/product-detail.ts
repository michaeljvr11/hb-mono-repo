import { DatePipe, isPlatformBrowser, Location } from '@angular/common';
import {
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import {
  AnalyticsEventType,
  CreateReviewRequest,
  ProductDto,
  ProductReviewListDto,
  ReviewEligibilityDto,
  ReviewIneligibilityReason,
} from '@hb/shared';
import { AnalyticsService } from '../../core/api/analytics.service';
import { GoogleAnalyticsService } from '../../core/analytics/google-analytics.service';
import { AuthService } from '../../core/auth/auth.service';
import { sanitizeReturnUrl } from '../../core/auth/return-url';
import { CartService } from '../../core/api/cart.service';
import { WishlistService } from '../../core/api/wishlist.service';
import { ProductsService } from '../../core/api/products.service';
import { ReviewsService } from '../../core/api/reviews.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { formatPrice } from '../../shared/format-price';
import { buildResponsiveImage } from '../../shared/responsive-image';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { ProductCard } from '../../shared/components/product-card/product-card';
import { RadialNav } from '../../shared/components/radial-nav/radial-nav';

/** Distinct submit-error kinds so 409/403 never read as a generic failure. */
type ReviewSubmitErrorKind = 'duplicate' | 'ineligible' | 'generic';

interface ReviewSubmitError {
  kind: ReviewSubmitErrorKind;
  message: string;
}

interface ReviewApiErrorShape {
  status?: number;
  error?: { message?: string };
}

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

/** Loading/loaded/empty/error states for the reviews tab (fetched independently of the product). */
type ReviewsState = 'loading' | 'loaded' | 'empty' | 'error';

/** Number of related products shown in "You May Also Like". */
const RELATED_LIMIT = 4;

/** Server page size for the reviews tab — matches the API's default limit. */
const REVIEWS_PAGE_SIZE = 10;

/**
 * Product detail page (PDP). Fetches the product by the `:id` route param
 * (works during SSR — plain HttpClient relative URL, same pattern as every
 * other public catalogue service). A 404 from the API renders a friendly
 * not-found state rather than propagating the error.
 */
@Component({
  selector: 'app-product-detail',
  imports: [NavBar, Footer, ProductCard, RadialNav, RouterLink, DatePipe, ReactiveFormsModule],
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
  private readonly wishlistService = inject(WishlistService);
  private readonly reviewsService = inject(ReviewsService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly gaService = inject(GoogleAnalyticsService);
  private readonly notificationService = inject(NotificationService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Real cart count for the radial-nav badge. */
  readonly cartCount = this.cartService.itemCount;

  // Hydration gate: server render and first client render must both show
  // empty hearts (no anonymous-vs-signed-in DOM mismatch) — see nav-bar.ts.
  // Gates every wishlist surface on this page: the sticky-bar heart, the
  // related-products grid hearts, and the radial-nav badge. Also gates the
  // write-a-review section (PR-4) — not private any more since the template
  // now reads it directly there.
  readonly hydrated = signal(false);

  /** True once hydrated and the product is on the signed-in user's wishlist. */
  readonly isWishlisted = (productId: string): boolean =>
    this.hydrated() && this.wishlistService.has(productId);

  /** Real wishlist count for the radial-nav badge — 0 until hydrated, same gate as isWishlisted. */
  readonly wishlistCount = computed(() =>
    this.hydrated() ? this.wishlistService.itemCount() : 0,
  );

  private readonly productId = toSignal(
    this.route.paramMap.pipe(switchMap((params) => [params.get('id')])),
    { initialValue: null },
  );

  readonly product = signal<ProductDto | null>(null);
  readonly state = signal<LoadState>('loading');

  readonly relatedProducts = signal<ProductDto[]>([]);

  // ── Reviews tab ──────────────────────────────────────────────────────────
  // Fetched eagerly alongside the product (not gated on it, and never behind
  // hydration) so the first page is present in the SSR payload — reviews are
  // SEO-relevant content and this slice has no auth-dependent rendering.
  readonly reviewsState = signal<ReviewsState>('loading');
  readonly reviewsPage = signal(1);
  readonly reviewsList = signal<ProductReviewListDto | null>(null);

  readonly reviewCount = computed(() => this.reviewsList()?.summary.reviewCount ?? 0);
  readonly reviewAverage = computed(() => this.reviewsList()?.summary.averageRating ?? null);
  readonly reviewTotalPages = computed(() => {
    const total = this.reviewsList()?.total ?? 0;
    return Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE));
  });

  // ── Write a review (PR-4) ──────────────────────────────────────────────
  // Auth-dependent, so it lives entirely behind the same `hydrated` gate as
  // the wishlist state above: the eligibility endpoint 401s for anonymous
  // callers, and it's never called until `hydrated()` is true AND
  // `authService.isLoggedIn()` — see the constructor and the paramMap
  // subscription below. Neither the SSR render nor the first client
  // hydration pass renders any auth-dependent markup for this section.
  readonly ReviewIneligibilityReason = ReviewIneligibilityReason;

  readonly eligibility = signal<ReviewEligibilityDto | null>(null);
  readonly isAuthenticated = computed(() => this.hydrated() && this.authService.isLoggedIn());

  readonly submitting = signal(false);
  readonly reviewSubmitError = signal<ReviewSubmitError | null>(null);
  readonly reviewSubmitSuccess = signal(false);

  readonly reviewForm = this.fb.group({
    // Only ever set via setRating() from the 1-5 star buttons, so it's
    // always an integer — min/max alone cover the DTO's 1-5 bound.
    rating: this.fb.control(0, [Validators.min(1), Validators.max(5)]),
    body: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
  });

  readonly ratingValue = toSignal(this.reviewForm.controls.rating.valueChanges, {
    initialValue: this.reviewForm.controls.rating.value,
  });
  private readonly bodyValue = toSignal(this.reviewForm.controls.body.valueChanges, {
    initialValue: this.reviewForm.controls.body.value,
  });
  readonly bodyLength = computed(() => this.bodyValue().length);

  /**
   * The reviewer's own review for the `already_reviewed` case, matched from
   * the already-fetched review page by `existingReviewId`. There is no
   * single-review GET endpoint in this epic, so if the review isn't on the
   * currently loaded page, callers fall back to a plain message instead.
   */
  readonly existingReview = computed(() => {
    const elig = this.eligibility();
    if (
      !elig ||
      elig.reason !== ReviewIneligibilityReason.ALREADY_REVIEWED ||
      !elig.existingReviewId
    ) {
      return null;
    }
    return this.reviewsList()?.items.find((r) => r.id === elig.existingReviewId) ?? null;
  });

  // ── Image gallery ───────────────────────────────────────────────────────
  readonly activeImageIndex = signal(0);

  readonly images = computed(() => this.product()?.images ?? []);

  readonly activeImage = computed(() => {
    const imgs = this.images();
    return imgs[this.activeImageIndex()] ?? imgs[0] ?? null;
  });

  readonly hasMultipleImages = computed(() => this.images().length > 1);

  /** `srcset`/`sizes`-ready attrs for the hero image, or `null` when the product has none. */
  readonly activeImageAttrs = computed(() => {
    const image = this.activeImage();
    return image ? buildResponsiveImage(image) : null;
  });

  readonly activeImageAlt = computed(() => {
    const image = this.activeImage();
    return image?.altText ?? this.product()?.name ?? '';
  });

  // ── Derived display data ─────────────────────────────────────────────────
  readonly priceLabel = computed(() => {
    const p = this.product();
    if (!p) return '';
    return formatPrice(p.price, p.currency);
  });

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
    afterNextRender(() => {
      this.hydrated.set(true);
      // Prime the wishlist once per page load for signed-in users; toggles
      // elsewhere keep the shared WishlistService signal fresh.
      if (this.authService.isLoggedIn() && this.wishlistService.wishlist() === null) {
        this.wishlistService.load().subscribe({ error: () => undefined });
      }
      // Same gate for review eligibility: never fire this for anonymous
      // callers (it 401s), and only once hydration confirms the client and
      // server both agree on the anonymous first render.
      const id = this.productId();
      if (id && this.authService.isLoggedIn()) {
        this.fetchEligibility(id);
      }
    });

    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) {
        this.state.set('not-found');
        return;
      }
      this.loadProduct(id);
      this.loadReviews(id, 1);
      this.resetReviewForm();
      // Covers navigation between products after the page has already
      // hydrated (the afterNextRender primer above only ever fires once).
      if (this.hydrated() && this.authService.isLoggedIn()) {
        this.fetchEligibility(id);
      } else {
        this.eligibility.set(null);
      }
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

  private loadReviews(productId: string, page: number): void {
    this.reviewsState.set('loading');
    this.reviewsService.getReviews(productId, { page, limit: REVIEWS_PAGE_SIZE }).subscribe({
      next: (res) => {
        this.reviewsList.set(res);
        this.reviewsPage.set(page);
        this.reviewsState.set(res.summary.reviewCount === 0 ? 'empty' : 'loaded');
      },
      error: () => {
        this.reviewsState.set('error');
      },
    });
  }

  /** Server-driven pagination for the reviews tab — no-op outside the valid page range. */
  goToReviewsPage(page: number): void {
    const id = this.productId();
    if (!id || page < 1 || page > this.reviewTotalPages()) return;
    this.loadReviews(id, page);
  }

  /** Caller MUST already have confirmed `authService.isLoggedIn()` — this never guards it itself. */
  private fetchEligibility(productId: string): void {
    this.reviewsService.checkEligibility(productId).subscribe({
      next: (res) => this.eligibility.set(res),
      error: () => this.eligibility.set(null),
    });
  }

  private resetReviewForm(): void {
    this.reviewForm.reset({ rating: 0, body: '' });
    this.submitting.set(false);
    this.reviewSubmitError.set(null);
    this.reviewSubmitSuccess.set(false);
  }

  /** Pure 5-star fill mask for a given rating (1–5), rounded to the nearest whole star. */
  starsFilled(rating: number): boolean[] {
    const filled = Math.round(rating);
    return [0, 1, 2, 3, 4].map((i) => i < filled);
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

  /**
   * Shared anonymous gate for add-to-cart and wishlist actions: navigates to
   * `/login` with the current URL as `returnUrl` and returns `true` if the
   * caller must bail out; returns `false` for signed-in users.
   */
  private redirectAnonymous(): boolean {
    if (this.authService.isLoggedIn()) return false;
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
    return true;
  }

  private addProductToCart(product: ProductDto): void {
    if (this.redirectAnonymous()) return;
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

  /** Wishlist toggle for the "You May Also Like" related-products grid. */
  onRelatedWishlistToggle(product: ProductDto): void {
    if (this.redirectAnonymous()) return;
    // No optimistic mutation — the heart only reflects a successful server
    // response (via WishlistService's signal), so a failure can never leave
    // it lying about the real state.
    this.wishlistService.toggle(product.id).subscribe({
      error: (err: { error?: { message?: string } }) => {
        this.notificationService.error(err?.error?.message ?? 'Could not update your wishlist.');
      },
    });
  }

  /**
   * Wishlist toggle for the PDP hero / sticky bar (shared handler — only
   * one heart control exists for the page's own product, so there is no
   * risk of divergent state between call sites).
   */
  onWishlistToggle(): void {
    const product = this.product();
    if (!product) return;
    if (this.redirectAnonymous()) return;

    // Capture intent before the request resolves — WishlistService only
    // flips `has()` once the server confirms, so this can't drift from the
    // eventual heart state.
    const wasWishlisted = this.wishlistService.has(product.id);

    this.wishlistService.toggle(product.id).subscribe({
      next: () => {
        if (wasWishlisted) {
          this.notificationService.info(`Removed '${product.name}' from your wishlist.`);
          return;
        }
        this.notificationService
          .success(`Added '${product.name}' to your wishlist.`, 'View wishlist')
          .onAction()
          .subscribe(() => void this.router.navigate(['/wishlist']));
      },
      // No optimistic mutation here either — see onRelatedWishlistToggle.
      error: (err: { error?: { message?: string } }) => {
        this.notificationService.error(err?.error?.message ?? 'Could not update your wishlist.');
      },
    });
  }

  // ── Write a review (PR-4) ────────────────────────────────────────────────

  /** Star-rating widget click handler — only ever sets an integer 1-5. */
  setRating(value: number): void {
    this.reviewForm.controls.rating.setValue(value);
    this.reviewForm.controls.rating.markAsTouched();
  }

  /** Anonymous CTA: routes through the same `sanitizeReturnUrl` path used to read `returnUrl` on login/register. */
  signInToReview(): void {
    const returnUrl = sanitizeReturnUrl(this.router.url) ?? this.router.url;
    void this.router.navigate(['/login'], { queryParams: { returnUrl } });
  }

  submitReview(): void {
    if (this.submitting()) return;
    if (this.reviewForm.invalid) {
      this.reviewForm.markAllAsTouched();
      return;
    }
    const productId = this.productId();
    if (!productId) return;

    this.submitting.set(true);
    this.reviewSubmitError.set(null);
    this.reviewSubmitSuccess.set(false);

    const { rating, body } = this.reviewForm.getRawValue();
    const request: CreateReviewRequest = { rating, body };

    this.reviewsService.submit(productId, request).subscribe({
      next: () => {
        this.submitting.set(false);
        this.reviewSubmitSuccess.set(true);
        this.reviewForm.reset({ rating: 0, body: '' });
        // Never a local splice — refresh the current page straight from the server.
        this.loadReviews(productId, this.reviewsPage());
        // The reviewer is now `already_reviewed` — refresh eligibility to match.
        this.fetchEligibility(productId);
      },
      error: (err: ReviewApiErrorShape) => {
        this.submitting.set(false);
        this.reviewSubmitError.set(this.mapReviewSubmitError(err));
      },
    });
  }

  private mapReviewSubmitError(err: ReviewApiErrorShape): ReviewSubmitError {
    if (err?.status === 409) {
      return {
        kind: 'duplicate',
        message: err?.error?.message ?? "You've already reviewed this product.",
      };
    }
    if (err?.status === 403) {
      return {
        kind: 'ineligible',
        message: err?.error?.message ?? 'You are not eligible to review this product.',
      };
    }
    return {
      kind: 'generic',
      message: 'Could not submit your review right now. Please try again.',
    };
  }
}
