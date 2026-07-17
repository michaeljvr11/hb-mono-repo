import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, inject } from '@angular/core';

import { ConsentService } from '../consent.service';

/**
 * Minimal POPIA analytics-cookies banner. Mounted once in the root app
 * shell. Renders only in the browser while consent is undecided — the
 * server render (platform always non-browser) and an already-decided
 * client both show nothing, so there's no server/client structural
 * mismatch to hydrate.
 */
@Component({
  selector: 'app-consent-banner',
  templateUrl: './consent-banner.html',
  styleUrl: './consent-banner.scss',
})
export class ConsentBanner {
  private readonly consentService = inject(ConsentService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly visible = computed(
    () => isPlatformBrowser(this.platformId) && this.consentService.status() === 'unknown',
  );

  accept(): void {
    this.consentService.grant();
  }

  decline(): void {
    this.consentService.deny();
  }
}
