import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AddressDto, CountryCode, CreateAddressRequest } from '@hb/shared';
import { AddressesService } from '../../../../core/api/addresses.service';

type AddressFormMode = 'create' | 'edit';

const COUNTRY_LABELS: Record<CountryCode, string> = {
  [CountryCode.SOUTH_AFRICA]: 'South Africa (ZA)',
  [CountryCode.NAMIBIA]: 'Namibia (NA)',
};

@Component({
  selector: 'app-profile-addresses',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './profile-addresses.html',
  styleUrl: './profile-addresses.scss',
})
export class ProfileAddresses implements OnInit {
  private readonly addressesService = inject(AddressesService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly CountryCode = CountryCode;

  // ─── List state ──────────────────────────────────────────────────────────
  readonly addresses = signal<AddressDto[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');

  // ─── Form state ──────────────────────────────────────────────────────────
  readonly formOpen = signal(false);
  readonly formMode = signal<AddressFormMode>('create');
  readonly formPending = signal(false);
  readonly formError = signal('');
  readonly editingId = signal<string | null>(null);

  readonly form = this.fb.group({
    recipientName: ['', Validators.required],
    line1: ['', Validators.required],
    line2: [''],
    city: ['', Validators.required],
    region: [''],
    postalCode: [''],
    countryCode: this.fb.control<CountryCode>(CountryCode.SOUTH_AFRICA, Validators.required),
    phone: [''],
  });

  // ─── Delete guard (admin-catalog pattern) ───────────────────────────────
  readonly pendingDeleteId = signal<string | null>(null);
  readonly deleteError = signal('');

  ngOnInit(): void {
    this.load();
  }

  countryLabel(code: CountryCode): string {
    return COUNTRY_LABELS[code] ?? code;
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.addressesService.list().subscribe({
      next: (addresses) => {
        this.addresses.set(addresses);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load your addresses. Please refresh.');
        this.loading.set(false);
      },
    });
  }

  openAddForm(): void {
    this.formMode.set('create');
    this.editingId.set(null);
    this.form.reset({
      recipientName: '',
      line1: '',
      line2: '',
      city: '',
      region: '',
      postalCode: '',
      countryCode: CountryCode.SOUTH_AFRICA,
      phone: '',
    });
    this.formError.set('');
    this.formOpen.set(true);
  }

  openEditForm(address: AddressDto): void {
    this.formMode.set('edit');
    this.editingId.set(address.id);
    this.form.reset({
      recipientName: address.recipientName,
      line1: address.line1,
      line2: address.line2 ?? '',
      city: address.city,
      region: address.region ?? '',
      postalCode: address.postalCode ?? '',
      countryCode: address.countryCode,
      phone: address.phone ?? '',
    });
    this.formError.set('');
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
  }

  submitForm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const mode = this.formMode();
    const payload = this.toPayload();

    this.formPending.set(true);
    this.formError.set('');

    const request$ =
      mode === 'create'
        ? this.addressesService.create(payload)
        : this.addressesService.update(this.editingId()!, payload);

    request$.pipe(finalize(() => this.formPending.set(false))).subscribe({
      next: (address) => {
        if (mode === 'create') {
          this.addresses.update((list) => [...list, address]);
        } else {
          this.addresses.update((list) => list.map((a) => (a.id === address.id ? address : a)));
        }
        this.formOpen.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.formError.set(
          err.error?.message ??
            `Could not ${mode === 'create' ? 'add' : 'update'} the address. Please try again.`,
        );
      },
    });
  }

  confirmDelete(id: string): void {
    this.deleteError.set('');
    this.pendingDeleteId.set(id);
  }

  cancelDelete(): void {
    this.pendingDeleteId.set(null);
  }

  deleteAddress(id: string): void {
    this.deleteError.set('');
    this.addressesService.delete(id).subscribe({
      next: () => {
        this.addresses.update((list) => list.filter((a) => a.id !== id));
        this.pendingDeleteId.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.deleteError.set(err.error?.message ?? 'Failed to delete address. Please try again.');
        this.pendingDeleteId.set(null);
      },
    });
  }

  private toPayload(): CreateAddressRequest {
    const raw = this.form.getRawValue();
    return {
      recipientName: raw.recipientName,
      line1: raw.line1,
      line2: raw.line2 || undefined,
      city: raw.city,
      region: raw.region || undefined,
      postalCode: raw.postalCode || undefined,
      countryCode: raw.countryCode,
      phone: raw.phone || undefined,
    };
  }
}
