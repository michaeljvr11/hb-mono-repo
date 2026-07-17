import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyCode, OrderStatus, VendorOrderLineDto } from '@hb/shared';
import { OrdersService } from '../../../../core/api/orders.service';
import { vendorActionLabel, vendorActionsFor } from './vendor-order-transitions';

export { vendorActionLabel, vendorActionsFor } from './vendor-order-transitions';

@Component({
  selector: 'app-vendor-orders',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './vendor-orders.html',
  styleUrl: './vendor-orders.scss',
})
export class VendorOrders implements OnInit {
  private readonly ordersService = inject(OrdersService);

  /** Order lines owned by the calling vendor. */
  readonly lines = signal<VendorOrderLineDto[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** In-flight status update — stores the order-line id being mutated. */
  readonly pendingId = signal<string | null>(null);

  /** Error message shown when a status-update PATCH fails. */
  readonly actionError = signal<string | null>(null);

  /** Expose the pure transition helpers to the template. */
  readonly actionsFor = vendorActionsFor;
  readonly labelFor = vendorActionLabel;
  readonly CurrencyCode = CurrencyCode;

  ngOnInit(): void {
    this.ordersService.listForVendor().subscribe({
      next: (lines) => {
        this.lines.set(lines);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load orders. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  applyAction(line: VendorOrderLineDto, target: OrderStatus): void {
    if (this.pendingId() !== null) return; // guard against double-click
    this.pendingId.set(line.id);
    this.actionError.set(null);

    this.ordersService.updateStatus(line.orderId, target).subscribe({
      next: (updated) => {
        this.lines.update((list) =>
          list.map((l) => (l.id === line.id ? { ...l, orderStatus: updated.status } : l)),
        );
        this.pendingId.set(null);
      },
      error: () => {
        this.actionError.set('Status update failed. Please try again.');
        this.pendingId.set(null);
      },
    });
  }
}
