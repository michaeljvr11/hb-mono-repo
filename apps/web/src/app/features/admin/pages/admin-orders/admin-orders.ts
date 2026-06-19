import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AdminOrderListDto,
  AdminOrderListItemDto,
  CurrencyCode,
  OrderStatus,
} from '@hb/shared';
import { AdminOrdersService } from '../../../../core/api/admin-orders.service';

// A dedicated order-detail route is a follow-up once the orders/checkout module is real.
// For now, clicking a row selects it and shows details in a right-hand panel (split list/detail,
// mirroring the admin-users and admin-vendors pages).

type StatusFilter = OrderStatus | 'all';

interface StatusTab {
  label: string;
  value: StatusFilter;
}

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './admin-orders.html',
  styleUrl: './admin-orders.scss',
})
export class AdminOrders implements OnInit {
  private readonly adminOrdersService = inject(AdminOrdersService);

  readonly result = signal<AdminOrderListDto>({
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    pageCount: 1,
  });
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Server-side status filter. */
  readonly statusFilter = signal<StatusFilter>('all');

  /** Server-side vendor ID filter. */
  readonly vendorIdFilter = signal<string>('');

  /** Current page (1-based). */
  readonly page = signal(1);

  /** Currently selected order id (for the inline detail panel). */
  readonly selectedId = signal<string | null>(null);

  readonly statusTabs: StatusTab[] = [
    { label: 'All',        value: 'all' },
    { label: 'Pending',    value: OrderStatus.PENDING },
    { label: 'Confirmed',  value: OrderStatus.CONFIRMED },
    { label: 'Processing', value: OrderStatus.PROCESSING },
    { label: 'Shipped',    value: OrderStatus.SHIPPED },
    { label: 'Delivered',  value: OrderStatus.DELIVERED },
    { label: 'Cancelled',  value: OrderStatus.CANCELLED },
  ];

  /** Derived selected order. */
  readonly selectedOrder = computed<AdminOrderListItemDto | null>(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.result().items.find(o => o.id === id) ?? null;
  });

  readonly isPrevDisabled = computed(() => this.page() <= 1);
  readonly isNextDisabled = computed(() => this.page() >= this.result().pageCount);

  ngOnInit(): void {
    this.fetchOrders();
  }

  private fetchOrders(): void {
    this.loading.set(true);
    this.error.set(null);

    const status = this.statusFilter();
    const vendorId = this.vendorIdFilter().trim();

    this.adminOrdersService.listOrders({
      ...(status !== 'all' ? { status } : {}),
      ...(vendorId ? { vendorId } : {}),
      page: this.page(),
      limit: 20,
    }).subscribe({
      next: (data) => {
        this.result.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load orders. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  setStatusFilter(value: StatusFilter): void {
    this.statusFilter.set(value);
    this.page.set(1);
    this.selectedId.set(null);
    this.fetchOrders();
  }

  applyVendorFilter(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.vendorIdFilter.set(value);
    this.page.set(1);
    this.selectedId.set(null);
    this.fetchOrders();
  }

  selectOrder(id: string): void {
    this.selectedId.set(id);
  }

  goToPrev(): void {
    if (this.isPrevDisabled()) return;
    this.page.update(p => p - 1);
    this.selectedId.set(null);
    this.fetchOrders();
  }

  goToNext(): void {
    if (this.isNextDisabled()) return;
    this.page.update(p => p + 1);
    this.selectedId.set(null);
    this.fetchOrders();
  }

  /** Humanise an OrderStatus string (e.g. "pending" → "Pending"). */
  humanizeStatus(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  /** Short 8-char prefix of a UUID for display. */
  shortId(id: string): string {
    return id.slice(0, 8);
  }

  /** Display customer name with email fallback. */
  customerDisplay(order: AdminOrderListItemDto): string {
    return order.customerName ?? order.customerEmail;
  }

  /** Format an amount to 2 decimal places with its currency symbol. */
  formatMoney(amount: number, currency: CurrencyCode): string {
    const symbol = currency === 'ZAR' ? 'R' : 'N$';
    return `${symbol} ${amount.toFixed(2)} ${currency}`;
  }
}
