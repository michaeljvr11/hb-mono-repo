import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IsActiveMatchOptions, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CategoryDto } from '@hb/shared';
import { CategoryChips } from '../../shared/components/category-chips/category-chips';
import { CategoryNavStore } from './category-nav.store';

/** How many top-level categories the ≥1024px bar shows before the "All categories" trigger. */
export const BAR_LIMIT = 8;

/** Hover-intent delay before hovering the trigger opens the flyout (PLAN Phase 2). */
export const HOVER_INTENT_MS = 400;

/** Grace period after the pointer leaves the nav before a flyout closes. */
export const LEAVE_GRACE_MS = 200;

export interface CategoryGroup {
  parent: CategoryDto;
  children: CategoryDto[];
}

const byDisplayOrder = (a: CategoryDto, b: CategoryDto): number =>
  a.displayOrder - b.displayOrder || a.name.localeCompare(b.name);

const FOCUSABLE = 'a[href], button:not([disabled])';

/**
 * Second header row: the site's information architecture.
 *
 * - `≥1024px`: the first `BAR_LIMIT` top-level categories as plain links, then an
 *   "All categories" trigger whose flyout lists every category — grouped under parents
 *   when `parentId` is present, a flat grid otherwise (the seed taxonomy is flat).
 * - `768–1023px`: the same categories as a horizontally scrolling chip strip
 *   (`<app-category-chips>`), so the tablet band is not empty.
 * - `<768px`: nothing — mobile has the radial nav and `/shop`'s own toolbar.
 *
 * Flyout interaction: click toggles; hover opens after a 400ms intent delay; leaving the
 * nav closes after a short grace period; Escape closes and returns focus to the trigger;
 * Tab is trapped inside the panel while it is open. The reveal is an arc clip-path from the
 * trigger's position on `--hb-ease-spring`; reduced motion collapses it to a fade (SCSS).
 *
 * Renders nothing until the store has a non-empty list — an empty or failed category
 * fetch must not leave a bare "All categories" button in the header.
 */
@Component({
  selector: 'app-category-nav',
  imports: [RouterLink, RouterLinkActive, CategoryChips],
  templateUrl: './category-nav.html',
  styleUrl: './category-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class CategoryNav {
  private readonly store = inject(CategoryNavStore);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly triggerRef = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('panel');

  /** `paths: exact` + `queryParams: subset` so `/discover?categoryId=x&page=2` still marks x. */
  readonly activeOptions: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'subset',
    fragment: 'ignored',
    matrixParams: 'ignored',
  };

  readonly categories = this.store.categories;
  readonly ready = computed(
    () => this.store.state() === 'loaded' && this.categories().length > 0,
  );

  /**
   * Every top-level category with its children, in `displayOrder`. A category whose
   * `parentId` points at nothing in the list is promoted to top level rather than dropped.
   */
  readonly groups = computed<CategoryGroup[]>(() => {
    const all = [...this.categories()].sort(byDisplayOrder);
    const ids = new Set(all.map((c) => c.id));
    const roots = all.filter((c) => !c.parentId || !ids.has(c.parentId));
    return roots.map((parent) => ({
      parent,
      children: all.filter((c) => c.parentId === parent.id),
    }));
  });

  readonly topLevel = computed(() => this.groups().map((g) => g.parent));
  readonly barItems = computed(() => this.topLevel().slice(0, BAR_LIMIT));
  readonly isFlat = computed(() => this.groups().every((g) => g.children.length === 0));
  readonly chipCategories = computed(() => [...this.categories()].sort(byDisplayOrder));

  readonly open = signal(false);

  /** Horizontal origin of the arc reveal, measured from the trigger's centre on open. */
  readonly originPx = signal(0);

  /**
   * Query params off the router's root state rather than an injected `ActivatedRoute`: this
   * component lives in the header on every page, so the routed component's own route (and
   * whatever a page spec stubs it with) is not its concern — the URL is.
   */
  private readonly paramMap = toSignal(this.router.routerState.root.queryParamMap, {
    initialValue: null,
  });
  readonly activeCategoryId = computed(() => this.paramMap()?.get('categoryId') ?? null);

  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.store.load();
    this.destroyRef.onDestroy(() => this.clearTimers());
  }

  // ── Flyout ────────────────────────────────────────────────────────────────

  toggle(): void {
    if (this.open()) {
      this.close(true);
    } else {
      this.openPanel(true);
    }
  }

  openPanel(focusFirst: boolean): void {
    this.clearTimers();
    if (this.open()) return;
    const trigger = this.triggerRef()?.nativeElement;
    if (trigger) {
      this.originPx.set(trigger.offsetLeft + trigger.offsetWidth / 2);
    }
    this.open.set(true);
    if (focusFirst && isPlatformBrowser(this.platformId)) {
      afterNextRender(
        () => {
          const panel = this.panelRef()?.nativeElement;
          panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
        },
        { injector: this.injector },
      );
    }
  }

  close(returnFocus = false): void {
    this.clearTimers();
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) {
      this.triggerRef()?.nativeElement.focus();
    }
  }

  onEscape(): void {
    if (this.open()) {
      this.close(true);
    }
  }

  onTriggerEnter(): void {
    this.clearLeaveTimer();
    if (this.open() || this.hoverTimer) return;
    this.hoverTimer = setTimeout(() => {
      this.hoverTimer = null;
      this.openPanel(false);
    }, HOVER_INTENT_MS);
  }

  onTriggerLeave(): void {
    this.clearHoverTimer();
  }

  onNavEnter(): void {
    this.clearLeaveTimer();
  }

  onNavLeave(): void {
    this.clearHoverTimer();
    if (!this.open() || this.leaveTimer) return;
    this.leaveTimer = setTimeout(() => {
      this.leaveTimer = null;
      this.close();
    }, LEAVE_GRACE_MS);
  }

  /** Tab / Shift+Tab wrap inside the panel while it is open. */
  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const panel = this.panelRef()?.nativeElement;
    if (!panel) return;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = panel.ownerDocument.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // ── Chip strip (768–1023px) ───────────────────────────────────────────────

  onChipSelect(categoryId: string | null): void {
    void this.router.navigate(['/discover'], {
      queryParams: categoryId ? { categoryId } : {},
    });
  }

  // ── Timers ────────────────────────────────────────────────────────────────

  private clearTimers(): void {
    this.clearHoverTimer();
    this.clearLeaveTimer();
  }

  private clearHoverTimer(): void {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  private clearLeaveTimer(): void {
    if (this.leaveTimer) {
      clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
    }
  }
}
