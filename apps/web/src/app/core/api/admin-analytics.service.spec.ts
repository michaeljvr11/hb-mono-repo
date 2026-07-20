import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminAnalyticsSummaryDto, AnalyticsEventType, CurrencyCode } from '@hb/shared';

import { AdminAnalyticsService } from './admin-analytics.service';
import { environment } from '../../../environments/environment';

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;
  let httpMock: HttpTestingController;
  const API_URL = `${environment.apiBaseUrl}/admin/analytics`;

  const MOCK_SUMMARY: AdminAnalyticsSummaryDto = {
    funnel: [
      { stage: AnalyticsEventType.PRODUCT_VIEWED, sessions: 100 },
      { stage: AnalyticsEventType.ADD_TO_CART, sessions: 40 },
      { stage: AnalyticsEventType.CHECKOUT_STARTED, sessions: 20 },
      { stage: AnalyticsEventType.SHIPPING_SUBMITTED, sessions: 15 },
      { stage: AnalyticsEventType.PAYMENT_ATTEMPTED, sessions: 12 },
      { stage: AnalyticsEventType.PAYMENT_FAILED, sessions: 2 },
      { stage: AnalyticsEventType.ORDER_COMPLETED, sessions: 10 },
    ],
    conversionRate: 0.1,
    revenueByCurrency: [
      { currency: CurrencyCode.ZAR, amount: 5000 },
      { currency: CurrencyCode.NAD, amount: 1200 },
    ],
    timeSeries: [
      {
        date: '2026-07-01',
        orders: 5,
        revenueByCurrency: [{ currency: CurrencyCode.ZAR, amount: 2500 }],
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminAnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getSummary() with no args calls GET /admin/analytics with no query params', () => {
    service.getSummary().subscribe((res) => {
      expect(res).toEqual(MOCK_SUMMARY);
    });

    const req = httpMock.expectOne((r) => r.url === API_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush(MOCK_SUMMARY);
  });

  it('getSummary() omits undefined query fields', () => {
    service.getSummary({ from: '2026-07-01' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === API_URL);
    expect(req.request.params.get('from')).toBe('2026-07-01');
    expect(req.request.params.has('to')).toBe(false);
    expect(req.request.params.has('granularity')).toBe(false);
    req.flush(MOCK_SUMMARY);
  });

  it('getSummary() serialises from/to/granularity when all provided', () => {
    service
      .getSummary({ from: '2026-06-01', to: '2026-07-01', granularity: 'week' })
      .subscribe();

    const req = httpMock.expectOne(
      `${API_URL}?from=2026-06-01&to=2026-07-01&granularity=week`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('from')).toBe('2026-06-01');
    expect(req.request.params.get('to')).toBe('2026-07-01');
    expect(req.request.params.get('granularity')).toBe('week');
    req.flush(MOCK_SUMMARY);
  });
});
