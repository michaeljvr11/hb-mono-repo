import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Footer } from '../../../layout/footer/footer';
import { NavBar } from '../../../layout/nav-bar/nav-bar';

/** LC-2 — see about.ts for the Title/Meta + NavBar/Footer pattern this copies. */
const PAGE_TITLE = 'Cookie Policy — H&B E-Commerce';
const PAGE_DESCRIPTION =
  'The cookies H&B E-Commerce actually sets today, what they do, and how to control them.';

@Component({
  selector: 'app-cookie-policy',
  imports: [NavBar, Footer, RouterLink],
  templateUrl: './cookie-policy.html',
  styleUrl: './cookie-policy.scss',
})
export class CookiePolicy {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  /** Real, known fact — not a placeholder. See card LC-2 manifest. */
  readonly lastUpdated = '26 August 2026';

  constructor() {
    this.titleService.setTitle(PAGE_TITLE);
    this.meta.updateTag({ name: 'description', content: PAGE_DESCRIPTION });
  }
}
