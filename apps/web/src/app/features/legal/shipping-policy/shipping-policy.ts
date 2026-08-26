import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Footer } from '../../../layout/footer/footer';
import { NavBar } from '../../../layout/nav-bar/nav-bar';

/** LC-5 — see privacy-policy.ts for the Title/Meta + NavBar/Footer pattern this copies. */
const PAGE_TITLE = 'Shipping Policy — H&B E-Commerce';
const PAGE_DESCRIPTION =
  'Where H&B E-Commerce delivers, how the shipping fee is calculated, and what is and is not yet decided about delivery timeframes and risk in transit.';

@Component({
  selector: 'app-shipping-policy',
  imports: [NavBar, Footer, RouterLink],
  templateUrl: './shipping-policy.html',
  styleUrl: './shipping-policy.scss',
})
export class ShippingPolicy {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  /** Real, known fact — not a placeholder. See card LC-5 manifest. */
  readonly lastUpdated = '26 August 2026';

  constructor() {
    this.titleService.setTitle(PAGE_TITLE);
    this.meta.updateTag({ name: 'description', content: PAGE_DESCRIPTION });
  }
}
