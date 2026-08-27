import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Footer } from '../../../layout/footer/footer';
import { NavBar } from '../../../layout/nav-bar/nav-bar';
import { CONTACT_DETAILS, ENTITY_DETAILS } from '../../../shared/constants/site.constants';

/** LC-6 — see privacy-policy.ts for the Title/Meta + NavBar/Footer pattern this copies. */
const PAGE_TITLE = 'Export & Customs Terms — H&B E-Commerce';
const PAGE_DESCRIPTION =
  'When goods cross into Namibia duty-free under SACU, when a Procurement Service order sourced outside South Africa is a real import that attracts Namibian duty and VAT, and what H&B has not yet decided about customs paperwork.';

@Component({
  selector: 'app-export-customs',
  imports: [NavBar, Footer, RouterLink],
  templateUrl: './export-customs.html',
})
export class ExportCustoms {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  /** Real, known fact — not a placeholder. See card LC-6 manifest. */
  readonly lastUpdated = '27 August 2026';

  /** Same constant `/contact` and the Returns policy bind to, so support
   *  details can never drift between pages. */
  readonly contact = CONTACT_DETAILS;

  /** Registered entity facts — see ENTITY_DETAILS for provenance. */
  readonly entity = ENTITY_DETAILS;

  constructor() {
    this.titleService.setTitle(PAGE_TITLE);
    this.meta.updateTag({ name: 'description', content: PAGE_DESCRIPTION });
  }
}
