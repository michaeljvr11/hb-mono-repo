import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminEarningsReportDto, CurrencyCode } from '@hb/shared';

import { AdminEarningsService } from './earnings.service';
import { environment } from '../../../environments/environment';

describe('AdminEarningsService', () => {
  let service: AdminEarningsService;
  let httpMock: HttpTestingController;
  const API_URL = `${environment.apiBaseUrl}/admin/earnings`;

  const MOCK_REPORT: AdminEarningsReportDto = {
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-10T00:00:00.000Z',
    vendors: [],
    platformCommissionByCurrency: [{ currency: CurrencyCode.ZAR, amount: 150 }],
    platformListingGmvByCurrency: [{ currency: CurrencyCode.ZAR, amount: 2000 }],
    heldForVendorsByCurrency: [{ currency: CurrencyCode.ZAR, amount: 850 }],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminEarningsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getReport() with no args calls GET /admin/earnings with no query params', () => {
    service.getReport().subscribe((res) => {
      expect(res).toEqual(MOCK_REPORT);
    });

    const req = httpMock.expectOne((r) => r.url === API_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush(MOCK_REPORT);
  });

  it('getReport() serialises the window param', () => {
    service.getReport({ window: '1w' }).subscribe();

    const req = httpMock.expectOne(`${API_URL}?window=1w`);
    expect(req.request.params.get('window')).toBe('1w');
    req.flush(MOCK_REPORT);
  });

  it('getReport() serialises from/to/vendorId when all provided, omitting window', () => {
    service
      .getReport({ from: '2026-06-01', to: '2026-07-01', vendorId: 'v1' })
      .subscribe();

    const req = httpMock.expectOne(
      `${API_URL}?from=2026-06-01&to=2026-07-01&vendorId=v1`,
    );
    expect(req.request.params.has('window')).toBe(false);
    expect(req.request.params.get('from')).toBe('2026-06-01');
    expect(req.request.params.get('to')).toBe('2026-07-01');
    expect(req.request.params.get('vendorId')).toBe('v1');
    req.flush(MOCK_REPORT);
  });
});
