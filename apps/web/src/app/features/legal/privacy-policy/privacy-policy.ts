import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Footer } from '../../../layout/footer/footer';
import { NavBar } from '../../../layout/nav-bar/nav-bar';
import { ENTITY_DETAILS } from '../../../shared/constants/site.constants';

/** LC-2 — see about.ts for the Title/Meta + NavBar/Footer pattern this copies. */
const PAGE_TITLE = 'Privacy Policy — H&B E-Commerce';
const PAGE_DESCRIPTION =
  'What personal information H&B E-Commerce collects, why, who we share it with, and the rights you have over it.';

@Component({
  selector: 'app-privacy-policy',
  imports: [NavBar, Footer, RouterLink],
  templateUrl: './privacy-policy.html',
})
export class PrivacyPolicy {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  /** Real, known fact — not a placeholder. See card LC-2 manifest. */
  readonly lastUpdated = '26 August 2026';

  /** Registered entity facts — see ENTITY_DETAILS for provenance. Information
   *  Officer name/email remain unresolved and stay hardcoded placeholders in
   *  the template below (LC-1's Open Question 3 is still open). */
  readonly entity = ENTITY_DETAILS;

  constructor() {
    this.titleService.setTitle(PAGE_TITLE);
    this.meta.updateTag({ name: 'description', content: PAGE_DESCRIPTION });
  }
}
