import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderDto } from '@hb/shared';
import { OrdersService } from '../../../../core/api/orders.service';
import { formatPrice } from '../../../../shared/format-price';

/**
 * Read-only order history for the signed-in customer. List → detail is an
 * in-component split (no dedicated route — mirrors the admin-orders pattern),
 * driven by a selected-order id signal. No status transitions or mutation
 * actions are exposed here; that's the admin/vendor portals' job.
 */
@Component({
  selector: 'app-profile-orders',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './profile-orders.html',
  styleUrl: './profile-orders.scss',
})
export class ProfileOrders implements OnInit {
  private readonly ordersService = inject(OrdersService);

  readonly orders = signal<OrderDto[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  /** Currently selected order id (for the inline detail view). */
  readonly selectedId = signal<string | null>(null);

  /** Detail fetch state — kept separate from the list's loading/error. */
  readonly selectedOrder = signal<OrderDto | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');

  readonly hasOrders = computed(() => this.orders().length > 0);

  ngOnInit(): void {
    this.loading.set(true);
    this.error.set('');

    this.ordersService.list().subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your orders. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  selectOrder(id: string): void {
    this.selectedId.set(id);
    this.selectedOrder.set(null);
    this.detailError.set('');
    this.detailLoading.set(true);

    this.ordersService.getById(id).subscribe({
      next: (order) => {
        this.selectedOrder.set(order);
        this.detailLoading.set(false);
      },
      error: () => {
        this.detailError.set('Could not load this order. Please try again.');
        this.detailLoading.set(false);
      },
    });
  }

  backToList(): void {
    this.selectedId.set(null);
    this.selectedOrder.set(null);
    this.detailError.set('');
  }

  /** Humanise an OrderStatus string (e.g. "handed_to_hb" → "Handed to hb"). */
  humanizeStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }

  /** Short 8-char prefix of a UUID for display. */
  shortId(id: string): string {
    return id.slice(0, 8);
  }

  formatMoney(amount: number, currency: OrderDto['currency']): string {
    return formatPrice(amount, currency);
  }

  lineTotal(unitPrice: number, quantity: number): number {
    return unitPrice * quantity;
  }
}
