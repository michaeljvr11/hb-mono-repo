import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CommissionRateListItemDto, CreateCommissionRateRequest } from '@hb/shared';
import { CommissionService } from '../../../../core/api/commission.service';

@Component({
  selector: 'app-admin-commission',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule],
  templateUrl: './admin-commission.html',
  styleUrl: './admin-commission.scss',
})
export class AdminCommission implements OnInit {
  private readonly commissionService = inject(CommissionService);

  readonly items = signal<CommissionRateListItemDto[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** In-flight submission guard for the "schedule new rate" form. */
  readonly pending = signal(false);
  /** Inline error shown near the form — client-side validation or a failed submit. */
  readonly submitError = signal<string | null>(null);

  // Form fields.
  readonly ratePercent = signal<number | null>(null);
  readonly effectiveFrom = signal<string>('');
  readonly note = signal<string>('');

  readonly currentRate = computed<CommissionRateListItemDto | null>(() =>
    this.items().find(i => i.inForce) ?? null,
  );

  ngOnInit(): void {
    this.loadHistory();
  }

  private loadHistory(): void {
    this.loading.set(true);
    this.error.set(null);
    this.commissionService.list().subscribe({
      next: (data) => {
        this.items.set(data.items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load commission rate history. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  submit(): void {
    if (this.pending()) return;

    this.submitError.set(null);

    const rate = this.ratePercent();
    if (rate === null || Number.isNaN(rate) || rate < 0 || rate > 100) {
      this.submitError.set('Rate must be a number between 0 and 100.');
      return;
    }
    // Reject more than 2 decimal places (mirrors server-side @IsNumber({ maxDecimalPlaces: 2 })).
    // Comparing against Math.round(rate * 100) is float-unsafe (e.g. 8.29 * 100 === 828.9999999999999),
    // so this checks the decimal-string representation instead.
    if (!/^\d+(\.\d{1,2})?$/.test(String(rate))) {
      this.submitError.set('Rate can have at most 2 decimal places.');
      return;
    }

    const payload: CreateCommissionRateRequest = { ratePercent: rate };
    const effectiveFromInput = this.effectiveFrom().trim();
    if (effectiveFromInput) {
      // Input is a local datetime-local value; convert to ISO for the API.
      const parsed = new Date(effectiveFromInput);
      if (Number.isNaN(parsed.getTime())) {
        this.submitError.set('Effective date is not a valid date/time.');
        return;
      }
      payload.effectiveFrom = parsed.toISOString();
    }
    const note = this.note().trim();
    if (note.length > 500) {
      this.submitError.set('Note must be 500 characters or fewer.');
      return;
    }
    if (note) {
      payload.note = note;
    }

    this.pending.set(true);
    this.commissionService.create(payload).subscribe({
      next: () => {
        this.ratePercent.set(null);
        this.effectiveFrom.set('');
        this.note.set('');
        this.pending.set(false);
        this.loadHistory();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 409) {
          const message = typeof err.error?.message === 'string'
            ? err.error.message
            : 'A rate already exists at or after that effective date.';
          this.submitError.set(message);
        } else {
          this.submitError.set('Failed to schedule rate. Please try again.');
        }
        this.pending.set(false);
      },
    });
  }
}
