import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  input,
  isDevMode,
  viewChild,
} from '@angular/core';

export type StateMessageKind = 'loading' | 'empty' | 'error';

/** Fallback glyph per kind. `loading` renders a spinner instead and ignores this. */
const DEFAULT_ICONS: Record<StateMessageKind, string> = {
  loading: 'hourglass_top',
  empty: 'inventory_2',
  error: 'error_outline',
};

/**
 * The one way a screen says "nothing here yet" (PLAN Phase 4).
 *
 * Consolidates the four hand-rolled `.state-message` blocks (shop, discover,
 * vendor profile, PDP) into a single component so the icon size, tone, spacing
 * and — the part that mattered — the ARIA wiring are decided once:
 *
 * - `loading` → `role="status" aria-live="polite" aria-busy="true"`, an
 *   indeterminate spinner rather than a frozen hourglass glyph.
 * - `empty`   → `role="status"`.
 * - `error`   → `role="alert"`, error tone.
 *
 * **The action slot is mandatory for `empty` and `error`.** A dead-end state is
 * the failure this component exists to prevent, so in dev mode an empty slot
 * logs a warning naming the message. Project anything interactive into it:
 *
 * ```html
 * <app-state-message kind="error" message="Could not load products.">
 *   <button stateAction type="button" class="state-message__btn" (click)="reload()">Try again</button>
 * </app-state-message>
 * ```
 *
 * Use this for *indeterminate* waits and terminal states. Content that has a
 * known shape (a product grid, a card) gets `<app-skeleton>` instead — a
 * skeleton previews the layout, a spinner only says "wait".
 */
@Component({
  selector: 'app-state-message',
  templateUrl: './state-message.html',
  styleUrl: './state-message.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StateMessage {
  readonly kind = input<StateMessageKind>('empty');
  /** Material Symbols glyph name. Ignored for `loading` (which renders a spinner). */
  readonly icon = input<string | null>(null);
  /** Optional heading above the message. */
  readonly heading = input<string | null>(null);
  readonly message = input.required<string>();
  /**
   * Opt out of the mandatory-action rule. Only for a state nested inside content
   * the user can already act on — the PDP's reviews panel, say, where the rest of
   * the product page is still on screen. A page-level state never sets this.
   */
  readonly requireAction = input(true);

  private readonly actionSlot = viewChild<ElementRef<HTMLElement>>('actionSlot');

  protected readonly resolvedIcon = computed(() => this.icon() ?? DEFAULT_ICONS[this.kind()]);
  protected readonly role = computed(() => (this.kind() === 'error' ? 'alert' : 'status'));

  constructor() {
    afterNextRender(() => {
      if (!isDevMode() || this.kind() === 'loading' || !this.requireAction()) return;
      const slot = this.actionSlot()?.nativeElement;
      if (slot && slot.childElementCount === 0) {
        console.warn(
          `[app-state-message] "${this.message()}" is a ${this.kind()} state with no action — ` +
            'project a link or button with the `stateAction` attribute so the state is not a dead end.',
        );
      }
    });
  }
}
