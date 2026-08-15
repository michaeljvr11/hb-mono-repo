import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Footer } from '../../layout/footer/footer';
import { NavBar } from '../../layout/nav-bar/nav-bar';
import { cssImageUrl, SITE_IMAGES } from '../../shared/constants/image.constants';

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

  /** CSS custom-property value for the hero section's background image. */
  readonly heroImage = cssImageUrl(SITE_IMAGES.aboutHero);

  constructor() {
    this.titleService.setTitle(PAGE_TITLE);
    this.meta.updateTag({ name: 'description', content: PAGE_DESCRIPTION });
  }
}
