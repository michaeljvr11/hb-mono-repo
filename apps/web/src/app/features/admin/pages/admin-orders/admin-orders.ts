import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AdminOrderListDto,
  AdminOrderListItemDto,
  CurrencyCode,
  OrderDto,
  OrderStatus,
  OrderStatusOverrideAuditDto,
  OrderStatusOverrideRequest,
} from '@hb/shared';
import { AdminOrdersService } from '../../../../core/api/admin-orders.service';
import { OrdersService } from '../../../../core/api/orders.service';

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
  private readonly ordersService = inject(OrdersService);

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

  /** Every status the admin override control can target — any status → any status. */
  readonly allStatuses: OrderStatus[] = Object.values(OrderStatus);

  /** Status-override form state (mirrors admin-vendors' pendingId/actionError pattern). */
  readonly overrideStatus = signal<OrderStatus>(OrderStatus.PENDING);
  readonly overrideReason = signal('');
  readonly overrideSendNotifications = signal(false);
  readonly overrideReasonError = signal<string | null>(null);
  readonly showOverrideConfirm = signal(false);
  readonly overrideError = signal<string | null>(null);
  /** In-flight override — stores the order id being mutated (double-submit guard). */
  readonly overridePendingId = signal<string | null>(null);

  /** Status-override audit history for the selected order. */
  readonly auditHistory = signal<OrderStatusOverrideAuditDto[]>([]);
  readonly auditLoading = signal(false);
  readonly auditError = signal<string | null>(null);

  /** Full order detail (incl. line items) for the selected order — the list row
   *  itself only carries an itemCount, not the lines. */
  readonly orderDetail = signal<OrderDto | null>(null);
  readonly orderDetailLoading = signal(false);
  readonly orderDetailError = signal<string | null>(null);

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
    this.clearOverrideState();
    this.fetchOrders();
  }

  applyVendorFilter(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.vendorIdFilter.set(value);
    this.page.set(1);
    this.selectedId.set(null);
    this.clearOverrideState();
    this.fetchOrders();
  }

  selectOrder(id: string): void {
    this.selectedId.set(id);
    this.clearOverrideState();
    this.overrideStatus.set(this.selectedOrder()?.status ?? OrderStatus.PENDING);
    this.fetchAuditHistory(id);
    this.fetchOrderDetail(id);
  }

  goToPrev(): void {
    if (this.isPrevDisabled()) return;
    this.page.update(p => p - 1);
    this.selectedId.set(null);
    this.clearOverrideState();
    this.fetchOrders();
  }

  goToNext(): void {
    if (this.isNextDisabled()) return;
    this.page.update(p => p + 1);
    this.selectedId.set(null);
    this.clearOverrideState();
    this.fetchOrders();
  }

  // ─── Status override ────────────────────────────────────────────────────

  onOverrideStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as OrderStatus;
    this.overrideStatus.set(value);
  }

  onReasonInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.overrideReason.set(value);
    if (value.trim()) {
      this.overrideReasonError.set(null);
    }
  }

  onSendNotificationsChange(event: Event): void {
    this.overrideSendNotifications.set((event.target as HTMLInputElement).checked);
  }

  /** Gate before the call fires — validates the reason, then shows the confirm step. */
  requestOverrideConfirm(): void {
    if (!this.overrideReason().trim()) {
      this.overrideReasonError.set('A reason is required.');
      return;
    }
    this.overrideReasonError.set(null);
    this.overrideError.set(null);
    this.showOverrideConfirm.set(true);
  }

  cancelOverrideConfirm(): void {
    this.showOverrideConfirm.set(false);
  }

  confirmOverride(orderId: string): void {
    if (this.overridePendingId() !== null) return; // guard against double-submit

    const request: OrderStatusOverrideRequest = {
      status: this.overrideStatus(),
      reason: this.overrideReason().trim(),
      sendNotifications: this.overrideSendNotifications(),
    };

    this.overridePendingId.set(orderId);
    this.overrideError.set(null);

    this.ordersService.overrideStatus(orderId, request).subscribe({
      next: (updated) => {
        // The lock is released unconditionally on completion — even for a stale
        // response — so switching selection mid-flight never leaves the Confirm
        // button permanently disabled. Only the panel/audit refresh below is
        // skipped for a stale response, since that data no longer corresponds to
        // what's on screen.
        if (this.overridePendingId() === orderId) this.overridePendingId.set(null);
        if (this.selectedId() !== orderId) return;

        // Refresh the order's status + updatedAt in the local list (the detail panel
        // reads from it).
        this.result.update(r => ({
          ...r,
          items: r.items.map(o =>
            o.id === orderId ? { ...o, status: updated.status, updatedAt: updated.updatedAt } : o,
          ),
        }));
        this.showOverrideConfirm.set(false);
        this.overrideReason.set('');
        this.fetchAuditHistory(orderId);
      },
      error: (err: HttpErrorResponse) => {
        if (this.overridePendingId() === orderId) this.overridePendingId.set(null);
        if (this.selectedId() !== orderId) return; // stale — see comment above

        this.overrideError.set(
          err.status === 409
            ? 'This order is already in that status — pick a different target status.'
            : 'Status override failed. Please try again.',
        );
        this.showOverrideConfirm.set(false);
      },
    });
  }

  private fetchAuditHistory(orderId: string): void {
    this.auditLoading.set(true);
    this.auditError.set(null);

    this.ordersService.getStatusOverrides(orderId).subscribe({
      next: (rows) => {
        // Stale response guard — see confirmOverride() for why this matters: a slow
        // response for an order the admin has since navigated away from must not
        // overwrite the audit history now shown for the newly selected order.
        if (this.selectedId() !== orderId) return;

        this.auditHistory.set(rows);
        this.auditLoading.set(false);
      },
      error: () => {
        if (this.selectedId() !== orderId) return;

        this.auditError.set('Failed to load status override history.');
        this.auditLoading.set(false);
      },
    });
  }

  /** Fetches the full order (incl. line items) for the detail panel's Items
   *  section. The list row only carries itemCount, not the lines themselves. */
  private fetchOrderDetail(orderId: string): void {
    this.orderDetailLoading.set(true);
    this.orderDetailError.set(null);

    this.ordersService.getById(orderId).subscribe({
      next: (order) => {
        // Stale response guard — see fetchAuditHistory() for why this matters.
        if (this.selectedId() !== orderId) return;

        this.orderDetail.set(order);
        this.orderDetailLoading.set(false);
      },
      error: () => {
        if (this.selectedId() !== orderId) return;

        this.orderDetailError.set('Failed to load order items.');
        this.orderDetailLoading.set(false);
      },
    });
  }

  /** Resets override-form + audit state for a new selection. Deliberately does NOT
   *  touch overridePendingId — an in-flight request's own completion is the only
   *  thing that releases that lock (unconditionally, even if stale); see
   *  confirmOverride(). This keeps the double-submit guard tied to the request
   *  it belongs to, rather than to whichever order happens to be selected. */
  private clearOverrideState(): void {
    this.overrideReason.set('');
    this.overrideSendNotifications.set(false);
    this.overrideReasonError.set(null);
    this.showOverrideConfirm.set(false);
    this.overrideError.set(null);
    this.auditHistory.set([]);
    this.auditLoading.set(false);
    this.auditError.set(null);
    this.orderDetail.set(null);
    this.orderDetailLoading.set(false);
    this.orderDetailError.set(null);
  }

  /** Humanise an OrderStatus string (e.g. "pending" → "Pending",
   *  "handed_to_hb" → "Handed To Hb"). */
  humanizeStatus(status: string): string {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /** Short 8-char prefix of a UUID for display. */
  shortId(id: string): string {
    return id.slice(0, 8);
  }

  /** Display customer name with email fallback. */
  customerDisplay(order: AdminOrderListItemDto): string {
    return order.customerName ?? order.customerEmail;
  }

  /** Display the admin who made an override; falls back to their id if the join
   *  couldn't resolve an email (e.g. the admin user was since deleted). */
  auditByDisplay(row: OrderStatusOverrideAuditDto): string {
    return row.adminEmail ?? row.adminUserId;
  }

  /** Known currency symbols. Unknown currencies fall back to the ISO code only —
   *  the currency is always data, never assumed. */
  private static readonly CURRENCY_SYMBOLS: Partial<Record<CurrencyCode, string>> = {
    ZAR: 'R',
    NAD: 'N$',
  };

  /** Format an amount to 2 decimal places with its currency symbol. */
  formatMoney(amount: number, currency: CurrencyCode): string {
    const symbol = AdminOrders.CURRENCY_SYMBOLS[currency] ?? '';
    return `${symbol} ${amount.toFixed(2)} ${currency}`.trim();
  }
}
