import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

export type RadialNavItemId = 'home' | 'search' | 'orders' | 'profile' | 'cart' | 'wishlist';

interface RadialNavItem {
  id: RadialNavItemId;
  icon: string;
  label: string;
  /** Set for items that navigate directly via routerLink instead of emitting itemSelected. */
  routerLink?: string;
}

interface PositionedItem extends RadialNavItem {
  /** Angle in degrees from vertical (0 = straight up, 90 = straight left), per the design's geometry. */
  angle: number;
  /** Ring radius in px (to item centre), before responsive scaling. */
  radius: number;
  /** Item diameter in px, before responsive scaling. */
  size: number;
}

/**
 * Angular port of docs/design/claude-design/screens/shared/radial-nav.js —
 * a corner FAB (bottom-right) that expands into concentric rings of nav
 * items. Mobile only (auto-hidden at >=768px via CSS media query; desktop
 * uses the top nav bar). Geometry mirrors the original: ring radii/angles are
 * reproduced as CSS custom properties (--dx/--dy/--size) computed from the
 * same trigonometry as the vanilla JS, driven by Angular signals instead of
 * direct DOM writes.
 */
@Component({
  selector: 'app-radial-nav',
  imports: [RouterLink],
  templateUrl: './radial-nav.html',
  styleUrl: './radial-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class RadialNav {
  readonly active = input<RadialNavItemId>('home');

  /** Real cart item count — shows a badge on the cart item when > 0. */
  readonly cartCount = input(0);

  /** Real wishlist item count — shows a badge on the wishlist item when > 0. */
  readonly wishlistCount = input(0);

  readonly itemSelected = output<RadialNavItemId>();

  readonly open = signal(false);

  /** Same ring layout as the design's RINGS constant (radial-nav.js). */
  private readonly items: RadialNavItem[] = [
    { id: 'home', icon: 'home', label: 'Home', routerLink: '/shop' },
    { id: 'search', icon: 'search', label: 'Search', routerLink: '/discover' },
    // /profile/orders is behind authGuard, same as /wishlist below — the guard
    // handles the anonymous case, so this is a plain link like the rest.
    { id: 'orders', icon: 'receipt_long', label: 'My Orders', routerLink: '/profile/orders' },
    { id: 'profile', icon: 'person', label: 'Profile', routerLink: '/profile' },
    { id: 'cart', icon: 'shopping_cart', label: 'Cart' },
    { id: 'wishlist', icon: 'favorite', label: 'Wishlist', routerLink: '/wishlist' },
  ];

  /** Angles per ring size, matching the original's ANG lookup table. */
  private static readonly RING_ANGLES: Record<number, number[]> = {
    1: [45],
    2: [33, 63],
    3: [22, 45, 68],
    4: [16, 39, 62, 84],
  };

  readonly positionedItems = computed<PositionedItem[]>(() => {
    const outerAngles = RadialNav.RING_ANGLES[4];
    const [homeItem, searchItem, ...outerItems] = this.items;

    const positioned: PositionedItem[] = [
      { ...homeItem, angle: 45, radius: 96, size: 60 },
      { ...searchItem, angle: 45, radius: 170, size: 58 },
      ...outerItems.map((item, i) => ({
        ...item,
        angle: outerAngles[i],
        radius: 244,
        size: 52,
      })),
    ];

    return positioned;
  });

  toggle(): void {
    this.open.set(!this.open());
  }

  collapse(): void {
    this.open.set(false);
  }

  onEscape(): void {
    if (this.open()) this.collapse();
  }

  selectItem(item: RadialNavItem): void {
    if (!item.routerLink) {
      this.itemSelected.emit(item.id);
    }
    this.collapse();
  }

  isActive(id: RadialNavItemId): boolean {
    return this.active() === id;
  }

  /** CSS transform offset (translate distance) for the collapsed→expanded animation. */
  offsetFor(item: PositionedItem): { dx: string; dy: string } {
    const rad = (item.angle * Math.PI) / 180;
    const dx = -item.radius * Math.sin(rad);
    const dy = -item.radius * Math.cos(rad);
    return { dx: `${dx}px`, dy: `${dy}px` };
  }
}
