import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { EarningsWindow } from '@hb/shared';

interface WindowTab {
  label: string;
  value: EarningsWindow;
}

/** The query fragment this component emits — a preset window OR an explicit
 *  custom range, never both. Mirrors the two shapes `AdminEarningsQuery` /
 *  `VendorEarningsQuery` already support; the server treats explicit `from`/`to`
 *  as winning over `window` when both are present, but we never rely on that
 *  tiebreak from the UI — preset and custom range are kept mutually exclusive
 *  at the source. */
export type EarningsRangeQuery = { window: EarningsWindow } | { from: string; to: string };

/** Cross-field validator: the end date cannot be before the start date. Only
 *  fires once both fields are populated — a half-filled range is simply
 *  incomplete, not invalid. */
function rangeOrderValidator(group: AbstractControl): ValidationErrors | null {
  const start = group.get('start')?.value as Date | null;
  const end = group.get('end')?.value as Date | null;
  if (start && end && end.getTime() < start.getTime()) {
    return { rangeOrder: true };
  }
  return null;
}

/** Format a `Date` as `yyyy-mm-dd` from its LOCAL date parts. Do not swap this
 *  for `date.toISOString().slice(0, 10)` — Material's native date adapter
 *  hands us local-timezone `Date`s, and `toISOString()` converts to UTC first.
 *  In a SAST (UTC+2) browser, picking any date whose local time is between
 *  midnight and 02:00 would `toISOString()` to the PREVIOUS calendar day,
 *  silently sending the wrong `from`/`to` to the earnings API. */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Four-preset window selector ("Last week" / "Last 2 weeks" / current month /
 * "All time") plus a mutually-exclusive custom start/end date range, shared by
 * `AdminEarnings` and `VendorEarnings` — previously duplicated verbatim in both.
 *
 * Emits a single `EarningsRangeQuery` fragment on every committed change; the
 * consuming page owns fetching and its own initial-load default (`'1m'`),
 * matching this component's own default active tab so the first paint and the
 * first request agree without this component needing to fire on init itself.
 */
@Component({
  selector: 'app-earnings-range-selector',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatDatepickerModule],
  templateUrl: './earnings-range-selector.html',
  styleUrl: './earnings-range-selector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EarningsRangeSelector {
  private readonly destroyRef = inject(DestroyRef);

  /** The loaded report's resolved `from` (server-echoed, so identical on SSR
   *  and hydration) — drives the "Last month" tab's real month/year label. */
  readonly reportFrom = input<string | null>(null);

  readonly rangeSelected = output<EarningsRangeQuery>();

  /** Active preset, or `null` when a custom range is active instead. Defaults
   *  to '1m' to match the API's own default and the consuming pages' initial
   *  fetch. */
  readonly selectedPreset = signal<EarningsWindow | null>('1m');

  readonly rangeError = signal<string | null>(null);

  readonly rangeForm = new FormGroup(
    {
      start: new FormControl<Date | null>(null),
      end: new FormControl<Date | null>(null),
    },
    { validators: rangeOrderValidator },
  );

  /** Caps both pickers at today, built from LOCAL date parts (see
   *  `formatLocalDate`) rather than `new Date().toISOString()` slicing, which
   *  would cap at the wrong day for part of the day in a UTC+2 browser.
   *  Reading `new Date()` here touches no browser API (`window`/`document`) —
   *  it's the wall clock, available identically on the server and in the
   *  browser — so no `isPlatformBrowser` guard is needed for SSR. */
  readonly maxDate: Date;

  /** Month + year for the current-month tab label — see `AdminEarnings`'s
   *  former `monthLabel` (moved here verbatim). Derived from the loaded
   *  report's `from` (server-resolved, identical value on server render and
   *  client hydration) rather than the client clock at page-load, which would
   *  risk an SSR/hydration text mismatch: formatting `new Date()` without an
   *  explicit `timeZone` uses each environment's local zone, so the server
   *  (often UTC) and a client browser in another zone could disagree on the
   *  calendar month right at a month boundary. `timeZone: 'UTC'` pins the
   *  format itself so server and client always agree regardless of
   *  environment, even before the report has loaded (using the client-clock
   *  fallback below). */
  private readonly monthLabel = computed(() => {
    const from = this.reportFrom();
    const date = from ? new Date(from) : new Date();
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  });

  readonly windowTabs = computed<WindowTab[]>(() => [
    { label: 'Last week', value: '1w' },
    { label: 'Last 2 weeks', value: '2w' },
    { label: this.monthLabel(), value: '1m' },
    { label: 'All time', value: 'all' },
  ]);

  constructor() {
    const now = new Date();
    this.maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    this.rangeForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.handleRangeChange();
    });
  }

  selectPreset(value: EarningsWindow): void {
    if (this.selectedPreset() === value) return;
    this.selectedPreset.set(value);
    this.rangeError.set(null);
    // emitEvent: false — this reset is a consequence of the preset selection,
    // not a user edit; the valueChanges handler below must not re-run and
    // fight the emission we're about to make.
    this.rangeForm.reset({ start: null, end: null }, { emitEvent: false });
    this.rangeSelected.emit({ window: value });
  }

  private handleRangeChange(): void {
    const startCtrl = this.rangeForm.controls.start;
    const endCtrl = this.rangeForm.controls.end;

    if (startCtrl.hasError('matDatepickerMax') || endCtrl.hasError('matDatepickerMax')) {
      this.rangeError.set('Dates cannot be in the future.');
      return;
    }
    if (this.rangeForm.hasError('rangeOrder')) {
      this.rangeError.set('End date cannot be before the start date.');
      return;
    }
    this.rangeError.set(null);

    const { start, end } = this.rangeForm.value;
    if (!start || !end) {
      // Incomplete — no request until both bounds are supplied.
      return;
    }

    this.selectedPreset.set(null);
    this.rangeSelected.emit({ from: formatLocalDate(start), to: formatLocalDate(end) });
  }
}
