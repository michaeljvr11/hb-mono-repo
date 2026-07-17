import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnalyticsEventType, CurrencyCode } from '@hb/shared';

import { AnalyticsService } from './analytics.service';
import { environment } from '../../../environments/environment';

const SESSION_ID_KEY = 'hb.analytics.sessionId';

describe('AnalyticsService (browser)', () => {
  let service: AnalyticsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    service = TestBed.inject(AnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('POSTs a CreateAnalyticsEventRequest with type/sessionId/occurredAt present', () => {
    service.track(AnalyticsEventType.PRODUCT_VIEWED, { productId: 'p1' });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/analytics/events`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.type).toBe(AnalyticsEventType.PRODUCT_VIEWED);
    expect(req.request.body.productId).toBe('p1');
    expect(typeof req.request.body.sessionId).toBe('string');
    expect(req.request.body.sessionId.length).toBeGreaterThan(0);
    expect(typeof req.request.body.occurredAt).toBe('string');
    expect(() => new Date(req.request.body.occurredAt).toISOString()).not.toThrow();

    req.flush({});
  });

  it('carries value + currency on ORDER_COMPLETED', () => {
    service.track(AnalyticsEventType.ORDER_COMPLETED, {
      orderId: 'o1',
      value: 370,
      currency: CurrencyCode.ZAR,
    });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/analytics/events`);
    expect(req.request.body).toMatchObject({
      type: AnalyticsEventType.ORDER_COMPLETED,
      orderId: 'o1',
      value: 370,
      currency: CurrencyCode.ZAR,
    });

    req.flush({});
  });

  it('mints a session id once and reuses it across calls', () => {
    service.track(AnalyticsEventType.PRODUCT_VIEWED, { productId: 'p1' });
    const first = httpMock.expectOne(`${environment.apiBaseUrl}/analytics/events`);
    const firstSessionId = first.request.body.sessionId;
    first.flush({});

    service.track(AnalyticsEventType.PRODUCT_VIEWED, { productId: 'p2' });
    const second = httpMock.expectOne(`${environment.apiBaseUrl}/analytics/events`);
    expect(second.request.body.sessionId).toBe(firstSessionId);
    second.flush({});

    // Persisted so a fresh service instance (next page load) reuses it too.
    expect(localStorage.getItem(SESSION_ID_KEY)).toBe(firstSessionId);
  });

  it('swallows HTTP errors — track() never throws or propagates', () => {
    expect(() => service.track(AnalyticsEventType.PAYMENT_FAILED)).not.toThrow();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/analytics/events`);
    expect(() => req.flush('boom', { status: 500, statusText: 'Server Error' })).not.toThrow();
  });
});

describe('AnalyticsService (server / SSR)', () => {
  let service: AnalyticsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    service = TestBed.inject(AnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('is a silent no-op on the server — no HTTP request issued', () => {
    expect(() =>
      service.track(AnalyticsEventType.PRODUCT_VIEWED, { productId: 'p1' }),
    ).not.toThrow();

    httpMock.expectNone(`${environment.apiBaseUrl}/analytics/events`);
  });
});
