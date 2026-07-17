import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SynonymDto } from '@hb/shared';
import { AdminSearchSynonymsService } from './admin-search-synonyms.service';
import { environment } from '../../../environments/environment';

describe('AdminSearchSynonymsService', () => {
  let service: AdminSearchSynonymsService;
  let httpMock: HttpTestingController;
  const API_URL = `${environment.apiBaseUrl}/admin/search/synonyms`;

  const MOCK_SYNONYM: SynonymDto = {
    id: 's1',
    term: 'moisturiser',
    equivalents: ['moisturizer'],
    bidirectional: true,
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminSearchSynonymsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('list() calls GET /admin/search/synonyms', () => {
    service.list().subscribe((res) => {
      expect(res).toEqual([MOCK_SYNONYM]);
    });

    const req = httpMock.expectOne(API_URL);
    expect(req.request.method).toBe('GET');
    req.flush([MOCK_SYNONYM]);
  });

  it('create() calls POST /admin/search/synonyms with body', () => {
    const body = { term: 'moisturiser', equivalents: ['moisturizer'], bidirectional: true, enabled: true };

    service.create(body).subscribe((res) => {
      expect(res).toEqual(MOCK_SYNONYM);
    });

    const req = httpMock.expectOne(API_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(MOCK_SYNONYM);
  });

  it('update() calls PATCH /admin/search/synonyms/:id with body', () => {
    const body = { enabled: false };

    service.update('s1', body).subscribe((res) => {
      expect(res).toEqual(MOCK_SYNONYM);
    });

    const req = httpMock.expectOne(`${API_URL}/s1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(body);
    req.flush(MOCK_SYNONYM);
  });

  it('remove() calls DELETE /admin/search/synonyms/:id', () => {
    service.remove('s1').subscribe((res) => {
      expect(res).toBeNull();
    });

    const req = httpMock.expectOne(`${API_URL}/s1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
