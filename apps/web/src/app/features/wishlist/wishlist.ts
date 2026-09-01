import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { WishlistItemDto } from '@hb/shared';
import { WishlistService } from '../../core/api/wishlist.service';
import { CartService } from '../../core/api/cart.service';
import { formatPrice } from '../../shared/format-price';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { NotificationService } from '../../core/notifications/notification.service';

type LoadState = 'loading' | 'loaded' | 'error';

/**
 * Auth-guarded wishlist page. A wishlist row has no quantity/line total —
 * `price`/`currency`/`stockQuantity`/`imageUrl` are the API's live read of
 * the product at response time (see WishlistItemDto). The client only
 * formats and displays; it never computes money.
 */
@Component({
  selector: 'app-wishlist',
  imports: [NavBar, Footer, RouterLink],
  templateUrl: './wishlist.html',
  styleUrl: './wishlist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Wishlist implements OnInit {
  private readonly wishlistService = inject(WishlistService);
  private readonly cartService = inject(CartService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  readonly state = signal<LoadState>('loading');
  /** Product id currently being mutated (disables its row controls while in flight). */
  readonly busyProductId = signal<string | null>(null);

  readonly wishlist = this.wishlistService.wishlist;
  readonly items = computed(() => this.wishlist()?.items ?? []);
  readonly isEmpty = computed(() => this.state() === 'loaded' && this.items().length === 0);

  ngOnInit(): void {
    this.wishlistService.load().subscribe({
      next: () => this.state.set('loaded'),
      error: () => this.state.set('error'),
    });
  }

  remove(item: WishlistItemDto): void {
    this.busyProductId.set(item.productId);
    this.wishlistService.remove(item.productId).subscribe({
      next: () => this.busyProductId.set(null),
      error: (err: { error?: { message?: string } }) => {
        this.busyProductId.set(null);
        this.notificationService.error(err?.error?.message ?? 'Could not remove this item.');
      },
    });
  }

  addToCart(item: WishlistItemDto): void {
    if (item.hasSizes) {
      // Sized products don't carry a meaningful stockQuantity, and the cart
      // API requires a productSizeId for them — same problem ProductCard
      // solves for its own quick-add. Route to the PDP so the customer can
      // pick a size instead of quick-adding.
      void this.router.navigate(['/products', item.productId]);
      return;
    }
    if (item.stockQuantity === 0) return;
    this.busyProductId.set(item.productId);
    this.cartService.addItem(item.productId).subscribe({
      next: () => {
        this.busyProductId.set(null);
        this.notificationService.success(`${item.productName} added to cart.`);
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyProductId.set(null);
        this.notificationService.error(err?.error?.message ?? 'Could not add this item to your cart.');
      },
    });
  }

  format(amount: number, currency: string): string {
    return formatPrice(amount, currency);
  }
}
