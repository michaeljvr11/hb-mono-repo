import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideNativeDateAdapter } from '@angular/material/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { EarningsRangeQuery, EarningsRangeSelector } from './earnings-range-selector';

// `apps/web`'s tsconfig.spec.json only pulls in `vitest/globals` types, not
// `node` (unlike tsconfig.app.json) — this test file is the first to touch
// `process.env` directly, so declare just enough of the shape locally rather
// than widening the app's type surface for one spec file. Vitest itself runs
// on Node, so `process` genuinely exists at runtime in this jsdom test env.
declare const process: { env: Record<string, string | undefined> };

/** This app is zoneless (no `zone.js` polyfill anywhere in `angular.json` —
 *  confirm before reaching for `fakeAsync`/`tick()` elsewhere in this repo),
 *  so Angular's Zone-based fake-async test helpers aren't available here.
 *  Debounced emissions are awaited with a genuine, short real-time delay
 *  instead — simple, framework-agnostic, and immune to the zoneless/fake
 *  timer interop questions `vi.useFakeTimers()` would raise against RxJS's
 *  default (real) `setTimeout`-based scheduler. */
const DEBOUNCE_MS = 300;
function afterDebounce(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 50));
}
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True only when the `TZ` env fake genuinely shifted the runtime's local
 *  zone to UTC+2 (SAST, no DST) before this check ran. `getTimezoneOffset()`
 *  returns MINUTES WEST of UTC, so UTC+2 is -120. Setting `process.env.TZ`
 *  at test-run time is unreliable across platforms (notably Windows) and
 *  Node only re-reads it for `Date` calls made AFTER the assignment —
 *  callers GATE on this (skip the case) rather than asserting it, so a
 *  runner where the fake didn't take skips the timezone-dependent case
 *  instead of failing it for an unrelated, environment reason. */
function sastZoneFakeTookEffect(): boolean {
  return new Date().getTimezoneOffset() === -120;
}

// ─── Test setup ────────────────────────────────────────────────────────────

describe('EarningsRangeSelector', () => {
  let fixture: ComponentFixture<EarningsRangeSelector>;
  let component: EarningsRangeSelector;
  let emissions: EarningsRangeQuery[];

  function tabs(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.tab-btn'));
  }

  function findTab(label: string): HTMLButtonElement {
    const tab = tabs().find((btn) => btn.textContent?.trim() === label);
    if (!tab) throw new Error(`No tab found with label "${label}"`);
    return tab;
  }

  function rangeInputs(): [HTMLInputElement, HTMLInputElement] {
    const inputs: HTMLInputElement[] = Array.from(fixture.nativeElement.querySelectorAll('input'));
    return [inputs[0], inputs[1]];
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EarningsRangeSelector],
      providers: [provideNoopAnimations(), provideNativeDateAdapter()],
    }).compileComponents();

    fixture = TestBed.createComponent(EarningsRangeSelector);
    component = fixture.componentInstance;
    emissions = [];
    component.rangeSelected.subscribe((query) => emissions.push(query));
    fixture.detectChanges();
  });

  // ─── Presets ───────────────────────────────────────────────────────────

  it('renders all four presets, including "All time"', () => {
    const labels = tabs().map((btn) => btn.textContent?.trim());

    expect(tabs()).toHaveLength(4);
    expect(labels).toContain('Last week');
    expect(labels).toContain('Last 2 weeks');
    expect(labels).toContain('All time');
    expect(labels.some((label) => /^[A-Z][a-z]+ \d{4}$/.test(label ?? ''))).toBe(true);
  });

  it('the current-month tab label is always derived from the wall clock, never from an input', () => {
    // No `reportFrom`-shaped input exists on this component at all — the
    // month label cannot be a function of a loaded report's resolved `from`,
    // which is exactly what would leak the 'all' preset's epoch sentinel (or
    // a custom range's picked month) into this tab's text.
    expect('reportFrom' in component).toBe(false);
  });

  it('clicking a preset emits { window: <value> }', () => {
    findTab('Last week').click();
    fixture.detectChanges();

    expect(emissions).toEqual([{ window: '1w' }]);
  });

  it('re-selecting the already-active preset is a no-op — no emission', () => {
    findTab('Last week').click(); // switch off the default '1m'
    fixture.detectChanges();
    emissions.length = 0;

    findTab('Last week').click(); // already active — should be ignored
    fixture.detectChanges();

    expect(emissions).toEqual([]);
  });

  // ─── Custom range — happy path ───────────────────────────────────────────

  it('a complete valid custom range emits { from, to } as yyyy-mm-dd strings, after the debounce settles', async () => {
    component.rangeForm.setValue({ start: new Date(2026, 0, 5), end: new Date(2026, 0, 20) });
    await afterDebounce();
    fixture.detectChanges();

    expect(emissions).toEqual([{ from: '2026-01-05', to: '2026-01-20' }]);
  });

  // ─── Preset ↔ custom range mutual exclusivity ────────────────────────────

  it('selecting a preset after a custom range clears the range and never emits both together', async () => {
    component.rangeForm.setValue({ start: new Date(2026, 0, 5), end: new Date(2026, 0, 20) });
    await afterDebounce();
    fixture.detectChanges();
    expect(emissions).toEqual([{ from: '2026-01-05', to: '2026-01-20' }]);
    expect(component.selectedPreset()).toBeNull();

    findTab('Last week').click();
    fixture.detectChanges();

    // Two separate emissions, each carrying exactly one shape — never merged.
    expect(emissions).toEqual([{ from: '2026-01-05', to: '2026-01-20' }, { window: '1w' }]);
    expect(component.rangeForm.value.start).toBeNull();
    expect(component.rangeForm.value.end).toBeNull();
    expect(component.rangeError()).toBeNull();
  });

  it('selecting a custom range after a preset clears the active preset', async () => {
    findTab('Last 2 weeks').click(); // differs from the default '1m'
    fixture.detectChanges();
    expect(component.selectedPreset()).toBe('2w');

    component.rangeForm.setValue({ start: new Date(2026, 0, 5), end: new Date(2026, 0, 20) });
    await afterDebounce();
    fixture.detectChanges();

    expect(component.selectedPreset()).toBeNull();
    expect(fixture.nativeElement.querySelector('.tab-btn--active')).toBeNull();
    expect(emissions).toEqual([{ window: '2w' }, { from: '2026-01-05', to: '2026-01-20' }]);
  });

  // ─── Custom range validation ─────────────────────────────────────────────

  it('end-before-start shows an inline error and emits nothing', async () => {
    component.rangeForm.setValue({ start: new Date(2026, 0, 20), end: new Date(2026, 0, 5) });
    await afterDebounce();
    fixture.detectChanges();

    expect(component.rangeError()).toBe('End date cannot be before the start date.');
    expect(emissions).toEqual([]);
    const errorEl = fixture.nativeElement.querySelector('.range-error');
    expect(errorEl?.textContent.trim()).toBe('End date cannot be before the start date.');
  });

  it('a future date shows an inline error and emits nothing', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    component.rangeForm.controls.start.setValue(tomorrow);
    await afterDebounce();
    fixture.detectChanges();

    expect(component.rangeError()).toBe('Dates cannot be in the future.');
    expect(emissions).toEqual([]);
  });

  it('unparseable typed text shows an inline "Enter a valid date." message and emits nothing', async () => {
    const [startInput] = rangeInputs();

    startInput.value = 'not-a-date';
    startInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await afterDebounce();
    fixture.detectChanges();

    expect(component.rangeError()).toBe('Enter a valid date.');
    expect(emissions).toEqual([]);
    const errorEl = fixture.nativeElement.querySelector('.range-error');
    expect(errorEl?.textContent.trim()).toBe('Enter a valid date.');
  });

  it('a half-filled range (only start) emits nothing — incomplete is not invalid', async () => {
    component.rangeForm.controls.start.setValue(new Date(2026, 0, 5));
    await afterDebounce();
    fixture.detectChanges();

    expect(emissions).toEqual([]);
    expect(component.rangeError()).toBeNull();
  });

  it('a half-filled range (only end) emits nothing — incomplete is not invalid', async () => {
    component.rangeForm.controls.end.setValue(new Date(2026, 0, 20));
    await afterDebounce();
    fixture.detectChanges();

    expect(emissions).toEqual([]);
    expect(component.rangeError()).toBeNull();
  });

  // ─── Debounce — a burst of intermediate values collapses into ONE fetch ──

  it('a burst of rapid intermediate value changes (simulating keystrokes) collapses into exactly ONE emission', async () => {
    component.rangeForm.controls.start.setValue(new Date(2026, 0, 1));
    await wait(50);
    component.rangeForm.controls.start.setValue(new Date(2026, 0, 2));
    await wait(50);
    component.rangeForm.controls.start.setValue(new Date(2026, 0, 5)); // settles here
    await wait(50);
    component.rangeForm.controls.end.setValue(new Date(2026, 0, 20)); // settles here
    await afterDebounce(); // debounce fires once, off the LAST change only

    fixture.detectChanges();
    expect(emissions).toEqual([{ from: '2026-01-05', to: '2026-01-20' }]);
  });

  // ─── Timezone trap — local date parts, never toISOString() ──────────────

  describe('local-date formatting under a faked UTC+2 (SAST) zone', () => {
    const ORIGINAL_TZ = process.env['TZ'];

    afterEach(() => {
      process.env['TZ'] = ORIGINAL_TZ;
    });

    it('formats a local-midnight Date as the SAME calendar day, not the previous UTC day', async (ctx) => {
      process.env['TZ'] = 'Africa/Johannesburg'; // UTC+2, no DST
      ctx.skip(
        !sastZoneFakeTookEffect(),
        'TZ fake did not take effect on this runner (offset !== -120) — skipping timezone-dependent case',
      );

      const localMidnight = new Date(2026, 6, 15); // 15 July 2026, local midnight

      component.rangeForm.setValue({ start: localMidnight, end: localMidnight });
      await afterDebounce();
      fixture.detectChanges();

      expect(emissions).toEqual([{ from: '2026-07-15', to: '2026-07-15' }]);
    });
  });

  // ─── maxDate — capped at UTC-today, never local-today ────────────────────

  describe('maxDate — UTC-derived cap', () => {
    const ORIGINAL_TZ = process.env['TZ'];

    afterEach(() => {
      process.env['TZ'] = ORIGINAL_TZ;
      vi.useRealTimers();
    });

    it('caps at UTC-today even when the local calendar day is already one day ahead', (ctx) => {
      process.env['TZ'] = 'Africa/Johannesburg'; // UTC+2, no DST
      ctx.skip(
        !sastZoneFakeTookEffect(),
        'TZ fake did not take effect on this runner (offset !== -120) — skipping timezone-dependent case',
      );

      // 23:30 UTC on 14 July — SAST local time is already 01:30 on 15 July,
      // so "local today" and "UTC today" genuinely disagree. This is
      // exactly the FAIL 2 scenario: a local-parts cap would offer/accept
      // 15 July, but the server's `IsNotFutureDate` guard evaluates in
      // UTC and would 400 it. Only the system clock is faked here (not
      // timers/scheduling), so it's independent of this file's zoneless
      // constraint above.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-14T23:30:00.000Z'));

      // Sanity: prove the fake genuinely put "local today" one day ahead
      // of "UTC today" — otherwise this test wouldn't exercise the
      // discrepancy at all.
      const now = new Date();
      expect(now.getDate()).toBe(15);
      expect(now.getUTCDate()).toBe(14);

      const zoneFixture = TestBed.createComponent(EarningsRangeSelector);
      const zoneComponent = zoneFixture.componentInstance;

      expect(zoneComponent.maxDate.getFullYear()).toBe(2026);
      expect(zoneComponent.maxDate.getMonth()).toBe(6); // July, 0-indexed
      expect(zoneComponent.maxDate.getDate()).toBe(14); // UTC-today, not local-today (15)
    });
  });
});
