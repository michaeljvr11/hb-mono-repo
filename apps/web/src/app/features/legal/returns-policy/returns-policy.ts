import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Footer } from '../../../layout/footer/footer';
import { NavBar } from '../../../layout/nav-bar/nav-bar';
import { CONTACT_DETAILS } from '../../../shared/constants/site.constants';

/** LC-5 — see privacy-policy.ts for the Title/Meta + NavBar/Footer pattern this copies. */
const PAGE_TITLE = 'Returns & Refunds Policy — H&B E-Commerce';
const PAGE_DESCRIPTION =
  'H&B E-Commerce: your 7-day cooling-off right, the 48-hour damage-claim window, how refunds work today, and how returns differ between Marketplace and Procurement Service purchases.';

@Component({
  selector: 'app-returns-policy',
  imports: [NavBar, Footer, RouterLink],
  templateUrl: './returns-policy.html',
})
export class ReturnsPolicy {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  /** Real, known fact — not a placeholder. See card LC-5 manifest. */
  readonly lastUpdated = '26 August 2026';

  /** Single source of truth for contact facts — binds to the same constant
   *  `/contact` uses, so the two can never drift. */
  readonly contact = CONTACT_DETAILS;

  /** Derived, not duplicated: the wa.me path is the phone number without
   *  the `tel:` scheme or leading `+`. */
  readonly whatsappNumber = CONTACT_DETAILS.phoneHref.replace(/^tel:\+?/, '');

  constructor() {
    this.titleService.setTitle(PAGE_TITLE);
    this.meta.updateTag({ name: 'description', content: PAGE_DESCRIPTION });
  }
}
