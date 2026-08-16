import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { HERO_SIZES, SITE_IMAGES } from '../../shared/constants/image.constants';

/** Establishes the Title/Meta pattern for static marketing pages — LSM-3 (/services) copies this. */
const PAGE_TITLE = 'About H&B — Cross-Border Trade Between South Africa and Namibia';
const PAGE_DESCRIPTION =
  "H&B bridges South Africa and Namibia with a personal import service and a vendor marketplace built on trust, transparency, and real relationships.";

@Component({
  selector: 'app-about',
  imports: [NavBar, Footer, RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.scss',
})
export class About {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  /** Hero artwork. A real `<img>` rather than a CSS background so the browser's
   * preload scanner can start it from the prerendered HTML — it is the LCP element. */
  readonly heroImage = SITE_IMAGES.aboutHero;
  readonly heroSizes = HERO_SIZES;

  constructor() {
    this.titleService.setTitle(PAGE_TITLE);
    this.meta.updateTag({ name: 'description', content: PAGE_DESCRIPTION });
  }
}
