import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { CartService } from '../../core/api/cart.service';
import { WishlistService } from '../../core/api/wishlist.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SITE_IMAGES } from '../../shared/constants/image.constants';
import { SearchBar } from '../../shared/components/search-bar/search-bar';
import { CategoryNav } from '../category-nav/category-nav';

@Component({
  selector: 'app-nav-bar',
  imports: [RouterLink, RouterLinkActive, SearchBar, CategoryNav],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
  host: {
    '(document:keydown.escape)': 'closeAccountMenu()',
  },
})
export class NavBar {
  protected readonly brandLogo = SITE_IMAGES.logo;

  private readonly notificationService = inject(NotificationService);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly wishlistService = inject(WishlistService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');

  // Raw signal from the auth observable — always starts null (safe for SSR).
  private readonly user = toSignal(this.authService.currentUser$, {
    initialValue: null,
  });

  // Hydration gate: both the server render and the initial client hydration
  // pass must see the anonymous state to avoid a DOM mismatch. After the first
  // client render completes we flip this to true and let the real auth state
  // through.
  private readonly hydrated = signal(false);

  readonly currentUser = computed(() => (this.hydrated() ? this.user() : null));
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly accountLabel = computed(() => {
    const u = this.currentUser();
    return u ? (u.firstName?.trim() || u.email || '') : '';
  });

  readonly accountMenuOpen = signal(false);

  /**
   * Compact header after 80px of scroll. Only ever set by the IntersectionObserver
   * fallback; browsers with CSS scroll-driven animations get the same end state from
   * the stylesheet and never see this class (see nav-bar.scss).
   */
  readonly compact = signal(false);

  // Real cart badge count — 0 until hydration + first cart load, so the
  // server render and initial client render always match.
  readonly cartCount = computed(() => (this.hydrated() ? this.cartService.itemCount() : 0));

  constructor() {
    afterNextRender(() => {
      this.hydrated.set(true);
      // Prime the badge once per page load for signed-in users; add/update
      // actions elsewhere keep the shared CartService signal fresh.
      if (this.authService.isLoggedIn() && this.cartService.cart() === null) {
        this.cartService.load().subscribe({ error: () => undefined });
      }
      // Prime the wishlist too — the nav-bar shows no badge itself (icon-only,
      // by design), but this keeps the radial-nav's wishlist badge fed on any
      // page where the nav-bar is present.
      if (this.authService.isLoggedIn() && this.wishlistService.wishlist() === null) {
        this.wishlistService.load().subscribe({ error: () => undefined });
      }
      this.observeScrollSentinel();
    });
  }

  notifyComingSoon(feature: string): void {
    this.notificationService.info(`${feature} is coming soon.`);
  }

  /** Header search submit → the discovery page owns the query from there. */
  onHeaderSearch(term: string): void {
    const q = term.trim();
    if (!q) return;
    void this.router.navigate(['/discover'], { queryParams: { q } });
  }

  onCartClick(): void {
    if (this.isAuthenticated()) {
      void this.router.navigate(['/cart']);
      return;
    }
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }

  onWishlistClick(): void {
    if (this.isAuthenticated()) {
      void this.router.navigate(['/wishlist']);
      return;
    }
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }

  signOut(): void {
    this.accountMenuOpen.set(false);
    this.authService.logout();
  }

  toggleAccountMenu(): void {
    this.accountMenuOpen.update(open => !open);
  }

  closeAccountMenu(): void {
    this.accountMenuOpen.set(false);
  }

  /**
   * IntersectionObserver fallback for the compact state. Skipped where the browser
   * supports scroll-driven animations (the stylesheet handles it there) and where
   * IntersectionObserver itself is missing. Runs inside `afterNextRender`, so browser-only.
   */
  private observeScrollSentinel(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()')) return;
    const target = this.sentinel()?.nativeElement;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => this.compact.set(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(target);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
