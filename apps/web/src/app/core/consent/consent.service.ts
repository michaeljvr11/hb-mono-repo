import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

const CONSENT_KEY = 'hb.consent.analytics';

export type ConsentStatus = 'unknown' | 'granted' | 'denied';

/**
 * POPIA-style analytics-cookies consent gate. Gates GoogleAnalyticsService
 * only — the bespoke first-party AnalyticsService (Analytics 2) is
 * unaffected. Browser-only persistence (localStorage); the server always
 * reports 'unknown' and never touches storage, so SSR output is consistent
 * regardless of any prior client-side choice.
 */
@Injectable({
  providedIn: 'root',
})
export class ConsentService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly status = signal<ConsentStatus>(this.readInitial());

  grant(): void {
    this.persist('granted');
  }

  deny(): void {
    this.persist('denied');
  }

  private persist(value: ConsentStatus): void {
    this.status.set(value);
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Private-mode / storage disabled — the in-memory signal still holds
      // for the current page lifetime; nothing further to do.
    }
  }

  private readInitial(): ConsentStatus {
    if (!this.isBrowser()) return 'unknown';
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      return stored === 'granted' || stored === 'denied' ? stored : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
