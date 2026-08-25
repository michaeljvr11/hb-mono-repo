import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  CountryCode,
  CreateShippingFeeSetEntry,
  CreateShippingFeeSetRequest,
  CurrencyCode,
  ShippingFeeDto,
  ShippingFeeSetDto,
} from '@hb/shared';
import { ShippingFeeService } from '../../../../core/api/shipping-fee.service';

/** One origin -> destination pair. Exactly 4 exist (see `ShippingFeeDto` doc comment). */
interface RouteDef {
  originCountry: CountryCode;
  destinationCountry: CountryCode;
  label: string;
}

const ROUTES: readonly RouteDef[] = [
  { originCountry: CountryCode.SOUTH_AFRICA, destinationCountry: CountryCode.SOUTH_AFRICA, label: 'ZA → ZA' },
  { originCountry: CountryCode.SOUTH_AFRICA, destinationCountry: CountryCode.NAMIBIA, label: 'ZA → NA' },
  { originCountry: CountryCode.NAMIBIA, destinationCountry: CountryCode.NAMIBIA, label: 'NA → NA' },
  { originCountry: CountryCode.NAMIBIA, destinationCountry: CountryCode.SOUTH_AFRICA, label: 'NA → ZA' },
] as const;

const CURRENCIES: readonly CurrencyCode[] = [CurrencyCode.ZAR, CurrencyCode.NAD] as const;

/** Deterministic key for a (route, currency) cell — used as both the form-control key
 *  and the lookup key when matching a `ShippingFeeDto` row from the API. */
function cellKey(originCountry: CountryCode, destinationCountry: CountryCode, currency: CurrencyCode): string {
  return `${originCountry}_${destinationCountry}_${currency}`;
}

/** Decimal-string validator mirroring the server's money validation — never compare
 *  parsed floats against each other (e.g. `8.29 * 100 !== 829` in IEEE754). */
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

function buildCellsGroup(): FormGroup<Record<string, FormControl<string>>> {
  const controls: Record<string, FormControl<string>> = {};
  for (const route of ROUTES) {
    for (const currency of CURRENCIES) {
      controls[cellKey(route.originCountry, route.destinationCountry, currency)] = new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(AMOUNT_PATTERN)],
      });
    }
  }
  return new FormGroup(controls);
}

@Component({
  selector: 'app-admin-shipping-fee',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule],
  templateUrl: './admin-shipping-fee.html',
  styleUrl: './admin-shipping-fee.scss',
})
export class AdminShippingFee implements OnInit {
  private readonly shippingFeeService = inject(ShippingFeeService);

  readonly routes = ROUTES;
  readonly currencies = CURRENCIES;

  readonly sets = signal<ShippingFeeSetDto[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** In-flight submission guard for the "schedule new fee set" form. */
  readonly pending = signal(false);
  /** Inline error shown near the form — client-side validation or a failed submit
   *  (409/400 messages are surfaced verbatim, per SF-2's spec). */
  readonly submitError = signal<string | null>(null);

  readonly currentSet = computed<ShippingFeeSetDto | null>(
    () => this.sets().find(s => s.inForce) ?? null,
  );

  readonly form = new FormGroup({
    cells: buildCellsGroup(),
    effectiveFrom: new FormControl('', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  ngOnInit(): void {
    this.loadHistory();
  }

  /** Looks up the fee for a (route, currency) cell within a given set, for both the
   *  headline grid and the history table (a set may in theory omit a row only if the
   *  API contract is violated — this stays `undefined`-safe regardless). */
  feeFor(set: ShippingFeeSetDto, route: RouteDef, currency: CurrencyCode): ShippingFeeDto | undefined {
    return set.fees.find(
      f => f.originCountry === route.originCountry
        && f.destinationCountry === route.destinationCountry
        && f.currency === currency,
    );
  }

  /** Copies the current in-force amounts into the form so the admin only has to touch
   *  the cells that actually change. Copies real currently-set values for BOTH
   *  currencies — it never derives NAD from ZAR (the peg is data, not an assumption). */
  copyCurrentValues(): void {
    const current = this.currentSet();
    if (!current) return;

    const patch: Record<string, string> = {};
    for (const route of ROUTES) {
      for (const currency of CURRENCIES) {
        const fee = this.feeFor(current, route, currency);
        if (fee) {
          patch[cellKey(route.originCountry, route.destinationCountry, currency)] = fee.amount.toFixed(2);
        }
      }
    }
    this.form.controls.cells.patchValue(patch);
  }

  private loadHistory(): void {
    this.loading.set(true);
    this.error.set(null);
    this.shippingFeeService.list().subscribe({
      next: (data) => {
        this.sets.set(data.items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load shipping fee history. Please refresh the page.');
        this.loading.set(false);
      },
    });
  }

  submit(): void {
    if (this.pending()) return;

    this.submitError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.submitError.set('Enter a valid amount (up to 2 decimal places) for every route and currency.');
      return;
    }

    const cells = this.form.controls.cells.controls;
    const fees: CreateShippingFeeSetEntry[] = ROUTES.flatMap(route =>
      CURRENCIES.map(currency => ({
        originCountry: route.originCountry,
        destinationCountry: route.destinationCountry,
        currency,
        // Parsed once, straight into the payload — never re-used in arithmetic.
        amount: parseFloat(cells[cellKey(route.originCountry, route.destinationCountry, currency)].value),
      })),
    );

    const payload: CreateShippingFeeSetRequest = { fees };

    const effectiveFromInput = this.form.controls.effectiveFrom.value.trim();
    if (effectiveFromInput) {
      // Input is a local datetime-local value; convert to ISO for the API.
      const parsed = new Date(effectiveFromInput);
      if (Number.isNaN(parsed.getTime())) {
        this.submitError.set('Effective date is not a valid date/time.');
        return;
      }
      payload.effectiveFrom = parsed.toISOString();
    }
    // Omitted entirely when blank, so the server's now() default applies.

    const note = this.form.controls.note.value.trim();
    if (note) {
      payload.note = note;
    }

    this.pending.set(true);
    this.shippingFeeService.create(payload).subscribe({
      next: () => {
        for (const control of Object.values(this.form.controls.cells.controls)) {
          control.reset('');
        }
        this.form.controls.effectiveFrom.reset('');
        this.form.controls.note.reset('');
        this.pending.set(false);
        this.loadHistory();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 409 || err.status === 400) {
          const message = typeof err.error?.message === 'string'
            ? err.error.message
            : 'That fee set could not be scheduled.';
          this.submitError.set(message);
        } else {
          this.submitError.set('Failed to schedule fee set. Please try again.');
        }
        this.pending.set(false);
      },
    });
  }
}
