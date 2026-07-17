import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import {
  AnalyticsEventDto,
  AnalyticsEventType,
  CreateAnalyticsEventRequest,
  CurrencyCode,
} from '@hb/shared';
import { environment } from '../../../environments/environment';

const SESSION_ID_KEY = 'hb.analytics.sessionId';

interface AnalyticsTrackContext {
  productId?: string;
  vendorId?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
}

/** `currency` is required whenever `value` is present — enforced by the type,
 *  not a runtime check (a monetary amount without a currency is meaningless). */
export type AnalyticsTrackOptions =
  | (AnalyticsTrackContext & { value?: undefined; currency?: undefined })
  | (AnalyticsTrackContext & { value: number; currency: CurrencyCode });

/**
 * Bespoke first-party funnel event dispatch (Analytics 2). Fire-and-forget:
 * `track()` never throws and never blocks the caller — HTTP failures are
 * swallowed internally so a lost analytics beacon can never break checkout
 * or any other UX. Browser-only; SSR renders touch no storage/network here.
 *
 * The session id is an anonymous, client-minted UUID persisted in
 * localStorage (never a user id / PII) so the pre-auth funnel can be
 * stitched together across a visit.
 */
@Injectable({
  providedIn: 'root',
})
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly API_URL = `${environment.apiBaseUrl}/analytics/events`;

  /** In-memory fallback/cache so we only touch localStorage once per session. */
  private sessionId: string | null = null;

  track(type: AnalyticsEventType, opts: AnalyticsTrackOptions = {}): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const body: CreateAnalyticsEventRequest = {
      type,
      sessionId: this.getSessionId(),
      occurredAt: new Date().toISOString(),
      ...opts,
    };

    this.http.post<AnalyticsEventDto>(this.API_URL, body).subscribe({
      error: (err) => {
        // Fire-and-forget: never surface/throw over a lost analytics beacon.
        if (!environment.production) {
          console.debug('[analytics] event dispatch failed', err);
        }
      },
    });
  }

  private getSessionId(): string {
    if (this.sessionId) return this.sessionId;

    try {
      const existing = localStorage.getItem(SESSION_ID_KEY);
      const id = existing ?? crypto.randomUUID();
      if (!existing) localStorage.setItem(SESSION_ID_KEY, id);
      this.sessionId = id;
      return id;
    } catch {
      // Private-mode / storage disabled — fall back to an in-memory id for
      // the page lifetime rather than losing funnel attribution entirely.
      this.sessionId = crypto.randomUUID();
      return this.sessionId;
    }
  }
}
