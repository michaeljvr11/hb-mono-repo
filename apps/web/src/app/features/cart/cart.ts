import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CartItemDto } from '@hb/shared';
import { CartService } from '../../core/api/cart.service';
import { formatPrice } from '../../shared/format-price';
import { Footer } from '../../layout/footer/footer';
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
  imports: [NavBar, Footer, RouterLink],
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

  readonly cart = this.cartService.cart;
  readonly items = computed(() => this.cart()?.items ?? []);
  readonly totals = computed(() => this.cart()?.totals ?? []);
  readonly isEmpty = computed(() => this.state() === 'loaded' && this.items().length === 0);

  ngOnInit(): void {
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
