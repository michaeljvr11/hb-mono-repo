import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  AnalyticsEventType,
  CountryCode,
  CurrencyCode,
  VendorAnalyticsDto,
  VendorSelfDto,
  VendorStatus,
} from '@hb/shared';

import { VendorsService } from './vendors.service';
import { environment } from '../../../environments/environment';

describe('VendorsService — getAnalytics', () => {
  let service: VendorsService;
  let httpMock: HttpTestingController;
  const API_URL = `${environment.apiBaseUrl}/vendors/me/analytics`;

  const MOCK_ANALYTICS: VendorAnalyticsDto = {
    funnel: [
      { stage: AnalyticsEventType.PRODUCT_VIEWED, sessions: 50 },
      { stage: AnalyticsEventType.ADD_TO_CART, sessions: 18 },
      { stage: AnalyticsEventType.CHECKOUT_STARTED, sessions: 0 },
      { stage: AnalyticsEventType.SHIPPING_SUBMITTED, sessions: 0 },
      { stage: AnalyticsEventType.PAYMENT_ATTEMPTED, sessions: 0 },
      { stage: AnalyticsEventType.PAYMENT_FAILED, sessions: 0 },
      { stage: AnalyticsEventType.ORDER_COMPLETED, sessions: 0 },
    ],
    orderCount: 6,
    revenueByCurrency: [
      { currency: CurrencyCode.ZAR, amount: 3200 },
      { currency: CurrencyCode.NAD, amount: 900 },
    ],
    timeSeries: [
      {
        date: '2026-07-01',
        orders: 3,
        revenueByCurrency: [{ currency: CurrencyCode.ZAR, amount: 1600 }],
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VendorsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getAnalytics() with no args calls GET /vendors/me/analytics with no query params', () => {
    service.getAnalytics().subscribe((res) => {
      expect(res).toEqual(MOCK_ANALYTICS);
    });

    const req = httpMock.expectOne((r) => r.url === API_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush(MOCK_ANALYTICS);
  });

  it('getAnalytics() omits undefined query fields', () => {
    service.getAnalytics({ from: '2026-07-01' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === API_URL);
    expect(req.request.params.get('from')).toBe('2026-07-01');
    expect(req.request.params.has('to')).toBe(false);
    expect(req.request.params.has('granularity')).toBe(false);
    req.flush(MOCK_ANALYTICS);
  });

  it('getAnalytics() serialises from/to/granularity when all provided', () => {
    service
      .getAnalytics({ from: '2026-06-01', to: '2026-07-01', granularity: 'week' })
      .subscribe();

    const req = httpMock.expectOne(
      `${API_URL}?from=2026-06-01&to=2026-07-01&granularity=week`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('from')).toBe('2026-06-01');
    expect(req.request.params.get('to')).toBe('2026-07-01');
    expect(req.request.params.get('granularity')).toBe('week');
    req.flush(MOCK_ANALYTICS);
  });
});

describe('VendorsService — profile self-view & uploads', () => {
  let service: VendorsService;
  let httpMock: HttpTestingController;
  const API_URL = `${environment.apiBaseUrl}/vendors`;

  const MOCK_SELF: VendorSelfDto = {
    id: 'vendor-1',
    businessName: 'My Store',
    status: VendorStatus.APPROVED,
    countryCode: CountryCode.SOUTH_AFRICA,
    website: 'https://mystore.example',
    description: 'We sell great things.',
    slogan: 'Quality you can trust',
    logoUrl: 'https://cdn.example/logo.png',
    bannerUrl: 'https://cdn.example/banner.png',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VendorsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getMe() calls GET /vendors/me and returns the self-view DTO', () => {
    service.getMe().subscribe((res) => {
      expect(res).toEqual(MOCK_SELF);
    });

    const req = httpMock.expectOne(`${API_URL}/me`);
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_SELF);
  });

  it('update() PATCHes /vendors/:id and returns the self-view DTO', () => {
    service.update('vendor-1', { slogan: 'New slogan' }).subscribe((res) => {
      expect(res).toEqual(MOCK_SELF);
    });

    const req = httpMock.expectOne(`${API_URL}/vendor-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ slogan: 'New slogan' });
    req.flush(MOCK_SELF);
  });

  it('uploadLogo() posts multipart FormData with field "file" to /vendors/me/logo', () => {
    const file = new File(['a'], 'logo.png', { type: 'image/png' });

    service.uploadLogo(file).subscribe((res) => {
      expect(res).toEqual(MOCK_SELF);
    });

    const req = httpMock.expectOne(`${API_URL}/me/logo`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush(MOCK_SELF);
  });

  it('uploadBanner() posts multipart FormData with field "file" to /vendors/me/banner', () => {
    const file = new File(['a'], 'banner.jpg', { type: 'image/jpeg' });

    service.uploadBanner(file).subscribe((res) => {
      expect(res).toEqual(MOCK_SELF);
    });

    const req = httpMock.expectOne(`${API_URL}/me/banner`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush(MOCK_SELF);
  });
});
