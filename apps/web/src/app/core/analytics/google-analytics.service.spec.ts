import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CurrencyCode } from '@hb/shared';

import { GoogleAnalyticsService } from './google-analytics.service';
import { ConsentService, ConsentStatus } from '../consent/consent.service';
import { environment } from '../../../environments/environment';

const TEST_MEASUREMENT_ID = 'G-TEST12345';

function clearGtagState(): void {
  delete window.gtag;
  delete window.dataLayer;
  document.querySelectorAll('script[src*="googletagmanager"]').forEach((el) => el.remove());
}

function gaScriptTag(): Element | null {
  return document.querySelector('script[src*="googletagmanager"]');
}

/** Pulls every `['event', name, params]` dataLayer push gtag() recorded. */
function eventPayloads(name: string): Record<string, unknown>[] {
  const entries = (window.dataLayer ?? []) as unknown[][];
  return entries
    .filter((entry) => entry[0] === 'event' && entry[1] === name)
    .map((entry) => entry[2] as Record<string, unknown>);
}

describe('GoogleAnalyticsService', () => {
  const originalId = environment.gaMeasurementId;

  beforeEach(() => {
    localStorage.clear();
    clearGtagState();
  });

  afterEach(() => {
    environment.gaMeasurementId = originalId;
    localStorage.clear();
    clearGtagState();
  });

  it('does not inject gtag/script while consent is "unknown" (id present, browser)', () => {
    environment.gaMeasurementId = TEST_MEASUREMENT_ID;
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(GoogleAnalyticsService);
    TestBed.tick();
    service.viewItem('p1');

    expect(window.gtag).toBeUndefined();
    expect(gaScriptTag()).toBeNull();
  });

  it('does not inject gtag/script once consent is "denied"', () => {
    environment.gaMeasurementId = TEST_MEASUREMENT_ID;
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const consent = TestBed.inject(ConsentService);
    TestBed.inject(GoogleAnalyticsService);
    consent.deny();
    TestBed.tick();

    expect(window.gtag).toBeUndefined();
    expect(gaScriptTag()).toBeNull();
  });

  it('never references window/document on the server, even with consent granted', () => {
    environment.gaMeasurementId = TEST_MEASUREMENT_ID;
    const consentStub = { status: signal<ConsentStatus>('granted') };

    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: ConsentService, useValue: consentStub },
      ],
    });

    const service = TestBed.inject(GoogleAnalyticsService);
    TestBed.tick();

    expect(() => service.purchase('order-1', 370, CurrencyCode.ZAR)).not.toThrow();
    expect(window.gtag).toBeUndefined();
    expect(gaScriptTag()).toBeNull();
  });

  it('stays inert when gaMeasurementId is empty, even with consent granted', () => {
    environment.gaMeasurementId = '';
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const consent = TestBed.inject(ConsentService);
    const service = TestBed.inject(GoogleAnalyticsService);
    consent.grant();
    TestBed.tick();
    service.viewItem('p1');

    expect(window.gtag).toBeUndefined();
    expect(gaScriptTag()).toBeNull();
  });

  it('initialises gtag once consent is granted mid-session (no reload) and emits GA4 events', () => {
    environment.gaMeasurementId = TEST_MEASUREMENT_ID;
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const consent = TestBed.inject(ConsentService);
    const service = TestBed.inject(GoogleAnalyticsService);

    // Attempted before consent — dropped silently, nothing initialised.
    service.viewItem('p1', 'Fynbos Honey', 145, CurrencyCode.ZAR);
    TestBed.tick();
    expect(window.gtag).toBeUndefined();

    consent.grant();
    TestBed.tick();

    expect(gaScriptTag()).toBeTruthy();
    expect(typeof window.gtag).toBe('function');

    service.viewItem('p1', 'Fynbos Honey', 145, CurrencyCode.ZAR);
    service.addToCart('p1', 'Fynbos Honey', 145, CurrencyCode.ZAR);
    service.beginCheckout(370, CurrencyCode.ZAR, [{ productId: 'p1', name: 'Fynbos Honey' }]);
    service.purchase('order-1', 370, CurrencyCode.ZAR);

    const [viewItem] = eventPayloads('view_item');
    expect(viewItem).toMatchObject({
      value: 145,
      currency: CurrencyCode.ZAR,
      items: [{ item_id: 'p1', item_name: 'Fynbos Honey' }],
    });

    const [addToCart] = eventPayloads('add_to_cart');
    expect(addToCart).toMatchObject({
      value: 145,
      currency: CurrencyCode.ZAR,
      items: [{ item_id: 'p1', item_name: 'Fynbos Honey' }],
    });

    const [beginCheckout] = eventPayloads('begin_checkout');
    expect(beginCheckout).toMatchObject({
      value: 370,
      currency: CurrencyCode.ZAR,
      items: [{ item_id: 'p1', item_name: 'Fynbos Honey' }],
    });

    const [purchase] = eventPayloads('purchase');
    expect(purchase).toMatchObject({
      transaction_id: 'order-1',
      value: 370,
      currency: CurrencyCode.ZAR,
    });

    // No PII fields (email, user id, address, ...) in any emitted payload —
    // only product/order identifiers and money amounts.
    expect(Object.keys(purchase).sort()).toEqual(['currency', 'transaction_id', 'value']);
    const items = viewItem['items'] as Record<string, unknown>[];
    expect(Object.keys(items[0]).sort()).toEqual(['item_id', 'item_name']);
  });
});
