import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { VendorDto } from '@hb/shared';

/**
 * Vendor grid for the "Featured SME Vendors" desktop storefront section:
 * initials avatar, verified check, country/location line, a 5-star rating
 * visual (static placeholder per design — no rating API yet).
 * 3-column desktop, single-column mobile.
 */
@Component({
  selector: 'app-vendor-showcase',
  imports: [],
  templateUrl: './vendor-showcase.html',
  styleUrl: './vendor-showcase.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorShowcase {
  readonly vendors = input.required<VendorDto[]>();

  readonly vendorSelected = output<VendorDto>();

  readonly stars = [0, 1, 2, 3, 4];

  select(vendor: VendorDto): void {
    this.vendorSelected.emit(vendor);
  }

  displayName(vendor: VendorDto): string {
    return vendor.tradingName ?? vendor.businessName;
  }

  initials(vendor: VendorDto): string {
    return this.displayName(vendor)
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase();
  }

  countryLabel(countryCode: string): string {
    return countryCode === 'ZA' ? 'South Africa' : countryCode === 'NA' ? 'Namibia' : countryCode;
  }
}
