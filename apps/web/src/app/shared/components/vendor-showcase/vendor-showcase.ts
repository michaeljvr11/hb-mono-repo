import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CountryCode, VendorDto, VendorStatus } from '@hb/shared';
import { buildResponsiveImage } from '../../responsive-image';

/**
 * Vendor grid for the "Featured SME Vendors" storefront section, restyled as
 * seller identity (Phase 3): logo or initials, name, an "HB approved" mark for
 * approved vendors, where they ship from, and how many listings they have.
 * The old static 5-star placeholder is gone — there is no rating API, and a
 * made-up score is the opposite of trust as content.
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
  /**
   * Live listing count per vendor id (the storefront derives it from the
   * products it already loaded). Vendors with no entry show no count line.
   */
  readonly listingCounts = input<Record<string, number>>({});

  readonly vendorSelected = output<VendorDto>();

  select(vendor: VendorDto): void {
    this.vendorSelected.emit(vendor);
  }

  displayName(vendor: VendorDto): string {
    return vendor.tradingName ?? vendor.businessName;
  }

  initials(vendor: VendorDto): string {
    return this.displayName(vendor)
      .split(/\s+/)
      // Skip bare punctuation ("Roots & Shoots" is RS, not R&).
      .filter((w) => /[\p{L}\p{N}]/u.test(w))
      .slice(0, 2)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase();
  }

  /** `<img>` attrs for the vendor's logo, or `null` to fall back to initials. */
  logo(vendor: VendorDto) {
    return vendor.logoUrl ? buildResponsiveImage({ url: vendor.logoUrl, ...vendor.logo }) : null;
  }

  isApproved(vendor: VendorDto): boolean {
    return vendor.status === VendorStatus.APPROVED;
  }

  listingCount(vendor: VendorDto): number | null {
    return this.listingCounts()[vendor.id] ?? null;
  }

  countryLabel(countryCode: string): string {
    switch (countryCode) {
      case CountryCode.SOUTH_AFRICA:
        return 'South Africa';
      case CountryCode.NAMIBIA:
        return 'Namibia';
      default:
        return countryCode;
    }
  }
}
