import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CartItemDto } from '@hb/shared';
import { CartService } from '../../core/api/cart.service';
import { formatPrice } from '../../shared/format-price';
import { Footer } from '../../layout/footer/footer';
import { Skeleton } from '../../shared/components/skeleton/skeleton';
import { StateMessage } from '../../shared/components/state-message/state-message';
import { TrustBanner } from '../../shared/components/trust-banner/trust-banner';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { NotificationService } from '../../core/notifications/notification.service';

type LoadState = 'loading' | 'loaded' | 'error';

/**
 * Auth-guarded cart page. All money shown here is display of API-computed
 * values (live product prices + server-side per-currency subtotals) — the
 * client never does money math beyond formatting.
 */
@Component({
  selector: 'app-cart',
  imports: [NavBar, Footer, RouterLink, Skeleton, StateMessage, TrustBanner],
  templateUrl: './cart.html',
  styleUrl: './cart.scss',
})
export class Cart implements OnInit {
  private readonly cartService = inject(CartService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  readonly state = signal<LoadState>('loading');
  /** Item currently being mutated (disables its controls while in flight). */
  readonly busyItemId = signal<string | null>(null);
  /** Skeleton rows while the cart loads. */
  readonly rowSkeletons = [0, 1];

  readonly cart = this.cartService.cart;
  readonly items = computed(() => this.cart()?.items ?? []);
  readonly totals = computed(() => this.cart()?.totals ?? []);
  readonly isEmpty = computed(() => this.state() === 'loaded' && this.items().length === 0);

  /**
   * The landed-cost duty line. Formatted in the cart's own currency rather than
   * hard-coded to "R0.00" — a NAD cart would be told its duties are in rand.
   * A mixed-currency cart has no single currency to format, so it says so in words.
   */
  readonly dutyLabel = computed(() => {
    const totals = this.totals();
    return totals.length === 1 ? `${formatPrice(0, totals[0].currency)} (SACU)` : 'None (SACU)';
  });

  ngOnInit(): void {
    this.load();
  }

  /** Also the error state's "Try again" — nothing else re-triggers the load. */
  load(): void {
    this.state.set('loading');
    this.cartService.load().subscribe({
      next: () => this.state.set('loaded'),
      error: () => this.state.set('error'),
    });
  }

  increment(item: CartItemDto): void {
    if (item.quantity >= item.stockQuantity) {
      this.notificationService.info(`Only ${item.stockQuantity} in stock.`);
      return;
    }
    this.mutate(item, this.cartService.updateItem(item.id, item.quantity + 1));
  }

  decrement(item: CartItemDto): void {
    if (item.quantity <= 1) return;
    this.mutate(item, this.cartService.updateItem(item.id, item.quantity - 1));
  }

  remove(item: CartItemDto): void {
    this.mutate(item, this.cartService.removeItem(item.id));
  }

  goToCheckout(): void {
    void this.router.navigate(['/checkout']);
  }

  format(amount: number, currency: string): string {
    return formatPrice(amount, currency);
  }

  private mutate(item: CartItemDto, mutation: ReturnType<CartService['load']>): void {
    this.busyItemId.set(item.id);
    mutation.subscribe({
      next: () => this.busyItemId.set(null),
      error: (err: { error?: { message?: string } }) => {
        this.busyItemId.set(null);
        this.notificationService.error(err?.error?.message ?? 'Could not update your cart.');
      },
    });
  }
}
