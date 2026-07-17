import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { CurrencyCode } from '@hb/shared';

import { ConsentService } from '../consent/consent.service';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** GA4 e-commerce item entry (only non-PII product fields). */
interface GaItem {
  item_id: string;
  item_name?: string;
}

export interface GaCheckoutItem {
  productId: string;
  name?: string;
}

/**
 * SSR-safe, consent-gated GA4 (gtag.js) wrapper. A complete no-op unless
 * ALL of: running in the browser, `environment.gaMeasurementId` is
 * non-empty, and analytics consent is 'granted' — checked fresh on every
 * call, so a mid-session consent change (or the id staying unset, as it
 * does until a GA4 property is provisioned) takes effect immediately with
 * no reload. No gtag/window/document reference ever happens on the server.
 * Events attempted before init are dropped silently — no buffering.
 * No PII is ever placed in a payload (product/order identifiers only).
 */
@Injectable({
  providedIn: 'root',
})
export class GoogleAnalyticsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly consentService = inject(ConsentService);

  private initialized = false;

  constructor() {
    // Reacts to consent changes so acceptance mid-session initialises GA
    // without a reload; denial (or the id being empty) simply never inits.
    effect(() => {
      if (this.consentService.status() === 'granted') {
        this.init();
      }
    });
  }

  viewItem(productId: string, name?: string, value?: number, currency?: CurrencyCode): void {
    this.send('view_item', this.itemPayload(productId, name, value, currency));
  }

  addToCart(productId: string, name?: string, value?: number, currency?: CurrencyCode): void {
    this.send('add_to_cart', this.itemPayload(productId, name, value, currency));
  }

  beginCheckout(value?: number, currency?: CurrencyCode, items?: GaCheckoutItem[]): void {
    this.send('begin_checkout', {
      ...(value !== undefined && currency ? { value, currency } : {}),
      ...(items?.length ? { items: items.map((i) => this.toGaItem(i.productId, i.name)) } : {}),
    });
  }

  /** Currency is always explicit — sourced from the order, never assumed. */
  purchase(orderId: string, value: number, currency: CurrencyCode): void {
    this.send('purchase', { transaction_id: orderId, value, currency });
  }

  private itemPayload(
    productId: string,
    name: string | undefined,
    value: number | undefined,
    currency: CurrencyCode | undefined,
  ): Record<string, unknown> {
    return {
      ...(value !== undefined && currency ? { value, currency } : {}),
      items: [this.toGaItem(productId, name)],
    };
  }

  private toGaItem(productId: string, name?: string): GaItem {
    return { item_id: productId, ...(name ? { item_name: name } : {}) };
  }

  private send(event: string, params: Record<string, unknown>): void {
    if (!this.ready()) return;
    window.gtag?.('event', event, params);
  }

  private ready(): boolean {
    return (
      this.initialized &&
      isPlatformBrowser(this.platformId) &&
      !!environment.gaMeasurementId &&
      this.consentService.status() === 'granted'
    );
  }

  private init(): void {
    if (this.initialized) return;
    if (!isPlatformBrowser(this.platformId)) return;
    if (!environment.gaMeasurementId) return;

    const measurementId = environment.gaMeasurementId;

    window.dataLayer = window.dataLayer ?? [];
    window.gtag = (...args: unknown[]) => {
      window.dataLayer?.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', measurementId);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);

    this.initialized = true;
  }
}
