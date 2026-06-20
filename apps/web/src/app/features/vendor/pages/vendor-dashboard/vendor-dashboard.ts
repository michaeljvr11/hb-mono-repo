import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe, KeyValuePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CurrencyCode, VendorDashboardDto } from '@hb/shared';
import { VendorsService } from '../../../../core/api/vendors.service';

@Component({
  selector: 'app-vendor-dashboard',
  standalone: true,
  imports: [DecimalPipe, KeyValuePipe, RouterLink],
  templateUrl: './vendor-dashboard.html',
  styleUrl: './vendor-dashboard.scss',
})
export class VendorDashboard implements OnInit {
  private readonly vendorsService = inject(VendorsService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly dashboard = signal<VendorDashboardDto | null>(null);

  readonly totalOrders = computed(() => {
    const counts = this.dashboard()?.orderCountByStatus ?? {};
    return Object.values(counts).reduce((sum, n) => sum + n, 0);
  });

  readonly CurrencyCode = CurrencyCode;

  ngOnInit(): void {
    this.vendorsService.getDashboard().subscribe({
      next: (data) => {
        this.dashboard.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load dashboard data. Please refresh.');
        this.loading.set(false);
      },
    });
  }
}
