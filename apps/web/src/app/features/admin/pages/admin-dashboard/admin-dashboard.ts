import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminDashboardDto, CurrencyCode } from '@hb/shared';
import { AdminOrdersService } from '../../../../core/api/admin-orders.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements OnInit {
  private readonly adminOrdersService = inject(AdminOrdersService);

  readonly dashboard = signal<AdminDashboardDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.adminOrdersService.getDashboard().subscribe({
      next: (data) => {
        this.dashboard.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load dashboard. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  /** Humanise an OrderStatus string (e.g. "pending" → "Pending"). */
  humanizeStatus(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  /** Known currency symbols. Unknown currencies fall back to the ISO code only —
   *  the currency is always data, never assumed. */
  private static readonly CURRENCY_SYMBOLS: Partial<Record<CurrencyCode, string>> = {
    ZAR: 'R',
    NAD: 'N$',
  };

  /** Format an amount to 2 decimal places with its currency symbol. */
  formatMoney(amount: number, currency: CurrencyCode): string {
    const symbol = AdminDashboard.CURRENCY_SYMBOLS[currency] ?? '';
    return `${symbol} ${amount.toFixed(2)} ${currency}`.trim();
  }
}
