import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface TrustBannerItem {
  icon: string;
  title: string;
  description: string;
  /** Short form for the `inline` variant, which has no room for the full title. Falls back to `title`. */
  short?: string;
  /** Selects the icon-chip color treatment. Defaults to 'primary'. */
  tone?: 'primary' | 'secondary' | 'tertiary';
}

/**
 * `strip` (default): the Corridor's waypoint strip — the four stops on the road
 * from the seller to the buyer's door, joined by a route line. `cards`: the
 * older three-up card grid, kept for non-storefront consumers (the Procurement
 * Service page passes its own items). `inline`: one low ribbon of short labels
 * for the places inside the funnel where the promise has to be *present* but must
 * not push the real content down — under the discover filters, under the PDP
 * price, above the cart totals, beside the checkout payment block.
 */
export type TrustBannerVariant = 'strip' | 'cards' | 'inline';

/**
 * The storefront's default: the four waypoints, in route order. Copy states
 * facts the platform stands behind today (SACU membership, the ZAR/NAD peg,
 * SA-origin sourcing, door delivery); it deliberately makes no delivery-time or
 * buyer-protection promise until those are data (PLAN §5 cards 4 and 5).
 */
const DEFAULT_ITEMS: TrustBannerItem[] = [
  {
    icon: 'storefront',
    title: 'Ships from South Africa',
    short: 'Ships from SA',
    description: 'Sourced from SA sellers and HB’s own range.',
    tone: 'primary',
  },
  {
    icon: 'verified_user',
    title: 'No customs duties (SACU)',
    short: 'No customs duties',
    description: 'One customs union, so nothing is added at the border.',
    tone: 'primary',
  },
  {
    icon: 'currency_exchange',
    title: 'Pay in ZAR or NAD, 1:1',
    short: 'ZAR or NAD, 1:1',
    description: 'The price you see is the price you pay. No exchange-rate surprises.',
    tone: 'primary',
  },
  {
    icon: 'home',
    title: 'Delivered to your door in Namibia',
    short: 'Delivered to your door',
    description: 'Tracked from dispatch to hand-over.',
    tone: 'secondary',
  },
];

@Component({
  selector: 'app-trust-banner',
  imports: [],
  templateUrl: './trust-banner.html',
  styleUrl: './trust-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrustBanner {
  readonly items = input<TrustBannerItem[]>(DEFAULT_ITEMS);
  readonly variant = input<TrustBannerVariant>('strip');
  /** Accessible label for the wrapping <section>. Defaults to the storefront's copy. */
  readonly label = input<string>('Why shop with H&B');
}
