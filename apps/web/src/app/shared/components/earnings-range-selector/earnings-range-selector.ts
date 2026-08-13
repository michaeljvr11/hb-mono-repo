import { ChangeDetectionStrategy, Component, DestroyRef, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { EarningsWindow, VendorEarningsQuery } from '@hb/shared';

interface WindowTab {
  label: string;
  value: EarningsWindow;
}

/** The query fragment this component emits — a preset window OR an explicit
 *  custom range, never both. Derived from `VendorEarningsQuery` (identical
 *  `window`/`from`/`to` shape to `AdminEarningsQuery`) rather than restated
 *  locally, so a contract rename propagates here instead of silently
 *  drifting. The server treats explicit `from`/`to` as winning over `window`
 *  when both are present, but we never rely on that tiebreak from the UI —
 *  preset and custom range are kept mutually exclusive at the source. */
export type EarningsRangeQuery =
  | Required<Pick<VendorEarningsQuery, 'window'>>
  | Required<Pick<VendorEarningsQuery, 'from' | 'to'>>;

type RangeFormValue = Partial<{ start: Date | null; end: Date | null }>;

function sameDate(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

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

  /** Caps both pickers at UTC-today, not local-today. Built from the wall
   *  clock's UTC parts, then fed into the LOCAL `Date` constructor —
   *  deliberately mixed coordinate systems, and not a mistake: Material's
   *  native date adapter compares picked dates using LOCAL parts (same as
   *  `formatLocalDate` below, which must stay local — the picked Date IS a
   *  local-parts Date), but the server's `IsNotFutureDate` guard
   *  (`apps/api/.../is-not-future-date.validator.ts`) evaluates "today" in
   *  UTC, because the whole earnings stack is UTC-pinned. Capping from LOCAL
   *  parts (`now.getFullYear()/getMonth()/getDate()`) would let a SAST
   *  (UTC+2) user pick/accept "today" between 00:00-02:00 local, while UTC
   *  is still "yesterday" — the picker would offer a date the server then
   *  400s. Reading `new Date()` touches no browser API (`window`/`document`)
   *  — it's the wall clock, identical on server and client — so no
   *  `isPlatformBrowser` guard is needed for SSR. */
  readonly maxDate: Date;

  /** Month + year for the current-calendar-month tab label, e.g. "August
   *  2026". Always derived from the CURRENT wall clock, NEVER from the
   *  loaded report's resolved `from` — that field is the wrong source for
   *  this label under two of this component's own presets/inputs: the
   *  'all' preset echoes back the server's epoch sentinel (1970-01-01), and
   *  a custom range's `from` is whatever the user picked, so a report
   *  loaded under either would relabel this tab "January 1970" or the
   *  picked month — the raw sentinel (and any window-driven date) must
   *  never surface as UI text. `timeZone: 'UTC'` pins the format so the
   *  label can't flip a day early/late relative to the wall clock in a
   *  non-UTC browser; it is NOT here to reconcile an SSR/hydration
   *  mismatch — `/admin/**` and `/vendor/**` both render
   *  `RenderMode.Client` (`app.routes.server.ts`), so this component never
   *  runs on the server in the first place. */
  private readonly monthLabel: string;

  readonly windowTabs: WindowTab[];

  constructor() {
    const now = new Date();
    this.maxDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

    this.monthLabel = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(now);

    this.windowTabs = [
      { label: 'Last week', value: '1w' },
      { label: 'Last 2 weeks', value: '2w' },
      { label: this.monthLabel, value: '1m' },
      { label: 'All time', value: 'all' },
    ];

    // debounceTime(300): each intermediate parse while a date is being TYPED
    // (not just picked from the calendar) would otherwise fire a report
    // fetch per keystroke — against an endpoint that, under a wide range,
    // does an unbounded `getMany()` plus in-memory aggregation. distinctUntil
    // Changed collapses a settled value that hasn't actually changed (e.g.
    // blur-without-edit re-emitting the same Dates) into a no-op.
    this.rangeForm.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(
          (a: RangeFormValue, b: RangeFormValue) => sameDate(a.start, b.start) && sameDate(a.end, b.end),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
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

    if (startCtrl.hasError('matDatepickerParse') || endCtrl.hasError('matDatepickerParse')) {
      // Unparseable typed text — Material nulls the control's value without
      // showing anything itself, so without this branch an invalid date
      // silently looked identical to "field just empty".
      this.rangeError.set('Enter a valid date.');
      return;
    }
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
