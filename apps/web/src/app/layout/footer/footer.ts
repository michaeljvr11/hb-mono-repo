import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE_IMAGES } from '../../shared/constants/image.constants';
import { SOCIAL_LINKS } from '../../shared/constants/site.constants';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {
  readonly currentYear = new Date().getFullYear();
  protected readonly brandLogo = SITE_IMAGES.logo;
  protected readonly social = SOCIAL_LINKS;
}
