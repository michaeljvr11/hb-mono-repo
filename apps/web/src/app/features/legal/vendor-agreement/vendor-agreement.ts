import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Footer } from '../../../layout/footer/footer';
import { NavBar } from '../../../layout/nav-bar/nav-bar';
import { CONTACT_DETAILS } from '../../../shared/constants/site.constants';

/** LC-7 — see privacy-policy.ts for the Title/Meta + NavBar/Footer pattern this copies. */
const PAGE_TITLE = 'Vendor Agreement — H&B E-Commerce';
const PAGE_DESCRIPTION =
  'The agreement vendors accept to sell on the H&B E-Commerce marketplace: what H&B does and does not verify, the current commission rate and how it can change, and how earnings accrue and are paid out today.';

@Component({
  selector: 'app-vendor-agreement',
  imports: [NavBar, Footer, RouterLink],
  templateUrl: './vendor-agreement.html',
})
export class VendorAgreement {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  /** Real, known fact — not a placeholder. See card LC-7 manifest. */
  readonly lastUpdated = '27 August 2026';

  /**
   * The commission rate published to vendors. Sourced from the only rate that
   * exists in the repository — the `CommissionRates1784419200000` migration's
   * seeded `15.00` row ("Initial platform commission rate (provisional)").
   *
   * This is deliberately NOT fetched from the API: the page is prerendered at
   * build time and has no authenticated context, and a public page silently
   * showing a stale rate would be worse than one whose source is stated. The
   * rate is admin-configurable and effective-dated, so if an admin has changed
   * it, this constant must be re-checked before the site goes public — see the
   * decision comment on card LC-7.
   */
  readonly commissionPercent = 15;

  /** 100 − commission. Derived so the two numbers can never contradict. */
  readonly vendorSharePercent = 100 - this.commissionPercent;

  /** Mirrors the API's `DAMAGE_CLAIM_WINDOW_HOURS` (apps/api/src/earnings/earnings.constants.ts). */
  readonly damageClaimWindowHours = 48;

  /** Same constant `/contact` and the other legal pages bind to. */
  readonly contact = CONTACT_DETAILS;

  constructor() {
    this.titleService.setTitle(PAGE_TITLE);
    this.meta.updateTag({ name: 'description', content: PAGE_DESCRIPTION });
  }
}
