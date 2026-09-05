import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

export interface SuggestionItem {
  id: string;
  label: string;
  sublabel?: string;
  imageUrl?: string;
  icon?: string;
}

export interface SuggestionGroup {
  label: string;
  items: SuggestionItem[];
}

export interface SuggestionSelectedEvent {
  group: string;
  item: SuggestionItem;
}

/** Flattened row used for keyboard highlight bookkeeping and selection. */
export interface FlatRow {
  groupLabel: string;
  item: SuggestionItem;
}

const DEBOUNCE_MS = 300;
const MIN_TERM_LENGTH = 2;

/**
 * Presentational, API-decoupled omnibox: the parent owns fetching suggestions
 * and passes them in via `suggestions`. Handles debounced term changes,
 * keyboard navigation across a grouped suggestion dropdown, and outside-click
 * dismissal (browser-only, leak-free via DestroyRef).
 */
@Component({
  selector: 'app-search-bar',
  imports: [],
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchBar {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly placeholder = input<string>('Search…');
  readonly value = input<string>('');
  /** `header`: the compact pill used in the site header at ≥768px (Phase 2). */
  readonly variant = input<'default' | 'header'>('default');
  readonly suggestions = input<SuggestionGroup[] | null>(null);
  readonly loading = input<boolean>(false);

  readonly termChange = output<string>();
  readonly search = output<string>();
  readonly suggestionSelected = output<SuggestionSelectedEvent>();
  readonly cleared = output<void>();

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('inputEl');

  readonly term = signal('');
  readonly panelOpen = signal(false);
  readonly activeIndex = signal(-1);

  private readonly termChanges$ = new Subject<string>();
  private readonly debouncedTerm = toSignal(
    this.termChanges$.pipe(
      debounceTime(DEBOUNCE_MS),
      distinctUntilChanged(),
    ),
    { initialValue: undefined },
  );

  /** Flattened, ordered list of suggestion rows — drives keyboard highlight math. */
  readonly flatRows = computed<FlatRow[]>(() => {
    const groups = this.suggestions();
    if (!groups) return [];
    return groups.flatMap((g) => g.items.map((item) => ({ groupLabel: g.label, item })));
  });

  readonly hasSuggestions = computed(() => this.flatRows().length > 0);

  readonly activeDescendantId = computed(() => {
    const idx = this.activeIndex();
    return idx >= 0 ? `search-bar-option-${idx}` : null;
  });

  constructor() {
    this.term.set(this.value());

    // Emit debounced term changes: only when empty (cleared) or >= min length.
    effect(() => {
      const debounced = this.debouncedTerm();
      if (debounced === undefined) return;
      if (debounced.length === 0 || debounced.length >= MIN_TERM_LENGTH) {
        this.termChange.emit(debounced);
      }
    });

    // Outside-click dismissal — browser only, registered once, torn down on destroy.
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const handler = (event: MouseEvent) => {
        if (!this.elementRef.nativeElement.contains(event.target as Node)) {
          this.closePanel();
        }
      };
      document.addEventListener('click', handler, true);
      this.destroyRef.onDestroy(() => document.removeEventListener('click', handler, true));
    });
  }

  /** Computes the flat keyboard-navigation index for a (group, item) pair in the template. */
  flatIndex(groupIndex: number, itemIndex: number): number {
    const groups = this.suggestions();
    if (!groups) return -1;
    let index = 0;
    for (let g = 0; g < groupIndex; g++) {
      index += groups[g].items.length;
    }
    return index + itemIndex;
  }

  onInput(raw: string): void {
    this.term.set(raw);
    this.activeIndex.set(-1);
    this.panelOpen.set(true);
    this.termChanges$.next(raw.trim());
  }

  onFocus(): void {
    if (this.term().length > 0 || this.hasSuggestions()) {
      this.panelOpen.set(true);
    }
  }

  clear(): void {
    this.term.set('');
    this.activeIndex.set(-1);
    this.panelOpen.set(false);
    this.termChanges$.next('');
    this.cleared.emit();
    this.inputRef()?.nativeElement.focus();
  }

  onKeydown(event: KeyboardEvent): void {
    const rows = this.flatRows();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!rows.length) return;
        this.panelOpen.set(true);
        this.activeIndex.set((this.activeIndex() + 1) % rows.length);
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (!rows.length) return;
        this.panelOpen.set(true);
        this.activeIndex.set((this.activeIndex() - 1 + rows.length) % rows.length);
        break;

      case 'Enter': {
        event.preventDefault();
        const idx = this.activeIndex();
        if (idx >= 0 && rows[idx]) {
          this.selectRow(rows[idx]);
        } else {
          this.search.emit(this.term().trim());
          this.panelOpen.set(false);
        }
        break;
      }

      case 'Escape':
        event.preventDefault();
        this.closePanel();
        break;
    }
  }

  selectSuggestion(row: FlatRow): void {
    this.selectRow(row);
  }

  private selectRow(row: FlatRow): void {
    this.suggestionSelected.emit({ group: row.groupLabel, item: row.item });
    this.term.set(row.item.label);
    this.closePanel();
  }

  private closePanel(): void {
    this.panelOpen.set(false);
    this.activeIndex.set(-1);
  }
}
