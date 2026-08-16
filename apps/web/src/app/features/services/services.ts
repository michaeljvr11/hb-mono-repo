import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { TrustBanner, TrustBannerItem } from '../../shared/components/trust-banner/trust-banner';
import { HERO_SIZES, SITE_IMAGES } from '../../shared/constants/image.constants';

/** LSM-3 — matches the Title/Meta pattern established by /about (LSM-2). */
const PAGE_TITLE = 'Procurement Service | H&B — Personal & Business Import, South Africa to Namibia';
const PAGE_DESCRIPTION =
  "H&B's Procurement Service sources and buys from South Africa and beyond, then imports it into Namibia on your behalf — clear quotes, secure payments, and door-to-door tracking.";

@Component({
  selector: 'app-services',
  imports: [NavBar, Footer, RouterLink, TrustBanner],
  templateUrl: './services.html',
  styleUrl: './services.scss',
})
export class Services {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  /** CSS custom-property value for the hero section's background image. */
  /** Hero artwork. A real `<img>` rather than a CSS background so the browser's
   * preload scanner can start it from the prerendered HTML — it is the LCP element. */
  readonly heroImage = SITE_IMAGES.servicesHero;
  readonly heroSizes = HERO_SIZES;

  /** Reuses app-trust-banner's 3-card layout instead of a bespoke grid. */
  readonly valueItems: TrustBannerItem[] = [
    {
      icon: 'shopping_bag',
      title: 'From Popular Sites',
      description:
        "Shop on Takealot, Temu, Amazon, Shein, or any South African or international store that doesn't ship to Namibia — we handle the rest.",
      tone: 'primary',
    },
    {
      icon: 'group',
      title: 'For Individuals & Businesses',
      description:
        'One-off personal orders or recurring bulk shipments for shops, restaurants and offices — we scale with your needs.',
      tone: 'secondary',
    },
    {
      icon: 'security',
      title: 'Transparent & Reliable',
      description:
        'Clear quotes (product cost + shipping + duties), real-time updates, secure payments, and careful handling every time.',
      tone: 'tertiary',
    },
  ];

  constructor() {
    this.titleService.setTitle(PAGE_TITLE);
    this.meta.updateTag({ name: 'description', content: PAGE_DESCRIPTION });
  }
}
