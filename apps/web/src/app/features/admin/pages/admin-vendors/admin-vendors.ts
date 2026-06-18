import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AdminVendorDto, VendorStatus } from '@hb/shared';
import { VendorsService } from '../../../../core/api/vendors.service';
import { vendorActionsFor } from './vendor-transitions';

export type { VendorAction } from './vendor-transitions';
export { vendorActionsFor } from './vendor-transitions';

type FilterValue = VendorStatus | 'all';

interface FilterTab {
  label: string;
  value: FilterValue;
}

@Component({
  selector: 'app-admin-vendors',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './admin-vendors.html',
  styleUrl: './admin-vendors.scss',
})
export class AdminVendors implements OnInit {
  private readonly vendorsService = inject(VendorsService);

  /** Full vendor list returned from the API. */
  readonly vendors = signal<AdminVendorDto[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Currently selected vendor id. */
  readonly selectedId = signal<string | null>(null);

  /** In-flight status update — stores the vendor id being mutated. */
  readonly pendingId = signal<string | null>(null);

  /** Error message shown inside the detail panel after a failed action. */
  readonly actionError = signal<string | null>(null);

  /** Active filter tab. */
  readonly activeFilter = signal<FilterValue>('all');

  readonly filterTabs: FilterTab[] = [
    { label: 'All',       value: 'all' },
    { label: 'Pending',   value: VendorStatus.PENDING },
    { label: 'Approved',  value: VendorStatus.APPROVED },
    { label: 'Rejected',  value: VendorStatus.REJECTED },
    { label: 'Suspended', value: VendorStatus.SUSPENDED },
  ];

  /** Derived filtered list. */
  readonly filteredVendors = computed<AdminVendorDto[]>(() => {
    const filter = this.activeFilter();
    const list = this.vendors();
    return filter === 'all' ? list : list.filter(v => v.status === filter);
  });

  /** Derived selected vendor object. */
  readonly selectedVendor = computed<AdminVendorDto | null>(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.vendors().find(v => v.id === id) ?? null;
  });

  /** Expose the pure transition helper to the template. */
  readonly actionsFor = vendorActionsFor;

  ngOnInit(): void {
    this.vendorsService.list().subscribe({
      next: (vendors) => {
        this.vendors.set(vendors);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load vendors. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  setFilter(value: FilterValue): void {
    this.activeFilter.set(value);
    // Clear selection when filter changes so the detail panel resets.
    this.selectedId.set(null);
    this.actionError.set(null);
  }

  selectVendor(id: string): void {
    this.selectedId.set(id);
    this.actionError.set(null);
  }

  countFor(filter: FilterValue): number {
    const list = this.vendors();
    return filter === 'all' ? list.length : list.filter(v => v.status === filter).length;
  }

  applyAction(vendorId: string, target: Exclude<VendorStatus, 'pending'>): void {
    if (this.pendingId() !== null) return; // guard against double-click
    this.pendingId.set(vendorId);
    this.actionError.set(null);

    this.vendorsService.updateStatus(vendorId, { status: target }).subscribe({
      next: (updated) => {
        // Update the vendor's status in the local signal list.
        this.vendors.update(list =>
          list.map(v => (v.id === vendorId ? { ...v, status: updated.status } : v))
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
