import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Footer } from '../../../layout/footer/footer';
import { NavBar } from '../../../layout/nav-bar/nav-bar';
import { CONTACT_DETAILS } from '../../../shared/constants/site.constants';

/** LC-4 — see privacy-policy.ts for the Title/Meta + NavBar/Footer pattern this copies. */
const PAGE_TITLE = 'Terms of Service — H&B E-Commerce';
const PAGE_DESCRIPTION =
  'The terms that govern your use of the H&B E-Commerce platform and any purchase you make through it, including the mandatory pre-sale disclosure, Marketplace vs Procurement Service, payment, delivery, and your right to cancel.';

@Component({
  selector: 'app-terms-of-service',
  imports: [NavBar, Footer, RouterLink],
  templateUrl: './terms-of-service.html',
})
export class TermsOfService {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  /** Real, known fact — not a placeholder. See card LC-4 manifest. */
  readonly lastUpdated = '26 August 2026';

  /** Single source of truth for the mandatory-disclosure contact facts —
   *  binds to the same constant `/contact` uses, so the two can never drift. */
  readonly contact = CONTACT_DETAILS;

  /** Derived, not duplicated: the wa.me path is the phone number without
   *  the `tel:` scheme or leading `+`. */
  readonly whatsappNumber = CONTACT_DETAILS.phoneHref.replace(/^tel:\+?/, '');

  constructor() {
    this.titleService.setTitle(PAGE_TITLE);
    this.meta.updateTag({ name: 'description', content: PAGE_DESCRIPTION });
  }
}
