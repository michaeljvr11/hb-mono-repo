import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface TrustBannerItem {
  icon: string;
  title: string;
  description: string;
  /** Selects the icon-chip color treatment. Defaults to 'primary'. */
  tone?: 'primary' | 'secondary' | 'tertiary';
}

const DEFAULT_ITEMS: TrustBannerItem[] = [
  {
    icon: 'verified_user',
    title: 'Secure Regional Payments',
    description: 'Instant ZAR to NAD settlement with zero cross-border fees for verified users.',
    tone: 'primary',
  },
  {
    icon: 'local_shipping',
    title: 'Express ZA-NA Logistics',
    description: "Door-to-door tracking from Cape Town or Jo'burg warehouses to Windhoek in 3-5 days.",
    tone: 'secondary',
  },
  {
    icon: 'policy',
    title: 'Simplified Customs',
    description: 'Automated SACU duty calculations and documentation for seamless clearance.',
    tone: 'tertiary',
  },
];

/**
 * The 3-card trust strip from the desktop storefront design
 * ("Secure Regional Payments / Express ZA-NA Logistics / Simplified Customs").
 * 3-column on desktop, single-column stack on mobile.
 */
@Component({
  selector: 'app-trust-banner',
  imports: [],
  templateUrl: './trust-banner.html',
  styleUrl: './trust-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrustBanner {
  readonly items = input<TrustBannerItem[]>(DEFAULT_ITEMS);
}
