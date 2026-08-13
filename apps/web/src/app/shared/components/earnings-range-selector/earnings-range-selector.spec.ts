import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideNativeDateAdapter } from '@angular/material/core';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EarningsRangeQuery, EarningsRangeSelector } from './earnings-range-selector';

// `apps/web`'s tsconfig.spec.json only pulls in `vitest/globals` types, not
// `node` (unlike tsconfig.app.json) — this test file is the first to touch
// `process.env` directly, so declare just enough of the shape locally rather
// than widening the app's type surface for one spec file. Vitest itself runs
// on Node, so `process` genuinely exists at runtime in this jsdom test env.
declare const process: { env: Record<string, string | undefined> };

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

  it('a complete valid custom range emits { from, to } as yyyy-mm-dd strings', () => {
    component.rangeForm.setValue({ start: new Date(2026, 0, 5), end: new Date(2026, 0, 20) });
    fixture.detectChanges();

    expect(emissions).toEqual([{ from: '2026-01-05', to: '2026-01-20' }]);
  });

  // ─── Preset ↔ custom range mutual exclusivity ────────────────────────────

  it('selecting a preset after a custom range clears the range and never emits both together', () => {
    component.rangeForm.setValue({ start: new Date(2026, 0, 5), end: new Date(2026, 0, 20) });
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

  it('selecting a custom range after a preset clears the active preset', () => {
    findTab('Last 2 weeks').click(); // differs from the default '1m'
    fixture.detectChanges();
    expect(component.selectedPreset()).toBe('2w');

    component.rangeForm.setValue({ start: new Date(2026, 0, 5), end: new Date(2026, 0, 20) });
    fixture.detectChanges();

    expect(component.selectedPreset()).toBeNull();
    expect(fixture.nativeElement.querySelector('.tab-btn--active')).toBeNull();
    expect(emissions).toEqual([{ window: '2w' }, { from: '2026-01-05', to: '2026-01-20' }]);
  });

  // ─── Custom range validation ─────────────────────────────────────────────

  it('end-before-start shows an inline error and emits nothing', () => {
    component.rangeForm.setValue({ start: new Date(2026, 0, 20), end: new Date(2026, 0, 5) });
    fixture.detectChanges();

    expect(component.rangeError()).toBe('End date cannot be before the start date.');
    expect(emissions).toEqual([]);
    const errorEl = fixture.nativeElement.querySelector('.range-error');
    expect(errorEl?.textContent.trim()).toBe('End date cannot be before the start date.');
  });

  it('a future date shows an inline error and emits nothing', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    component.rangeForm.controls.start.setValue(tomorrow);
    fixture.detectChanges();

    expect(component.rangeError()).toBe('Dates cannot be in the future.');
    expect(emissions).toEqual([]);
  });

  it('a half-filled range (only start) emits nothing — incomplete is not invalid', () => {
    component.rangeForm.controls.start.setValue(new Date(2026, 0, 5));
    fixture.detectChanges();

    expect(emissions).toEqual([]);
    expect(component.rangeError()).toBeNull();
  });

  it('a half-filled range (only end) emits nothing — incomplete is not invalid', () => {
    component.rangeForm.controls.end.setValue(new Date(2026, 0, 20));
    fixture.detectChanges();

    expect(emissions).toEqual([]);
    expect(component.rangeError()).toBeNull();
  });

  // ─── Timezone trap — local date parts, never toISOString() ──────────────

  describe('local-date formatting under a faked UTC+2 (SAST) zone', () => {
    const ORIGINAL_TZ = process.env['TZ'];

    afterEach(() => {
      process.env['TZ'] = ORIGINAL_TZ;
    });

    it('formats a local-midnight Date as the SAME calendar day, not the previous UTC day', () => {
      process.env['TZ'] = 'Africa/Johannesburg'; // UTC+2, no DST
      const localMidnight = new Date(2026, 6, 15); // 15 July 2026, local midnight

      // Sanity-check the fake genuinely shifts the zone: toISOString() would
      // roll this back to the previous calendar day — proof this test would
      // actually catch a regression to `toISOString().slice(0, 10)`.
      expect(localMidnight.toISOString().slice(0, 10)).toBe('2026-07-14');

      component.rangeForm.setValue({ start: localMidnight, end: localMidnight });
      fixture.detectChanges();

      expect(emissions).toEqual([{ from: '2026-07-15', to: '2026-07-15' }]);
    });
  });
});
