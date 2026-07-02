import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SearchSuggestions } from '@hb/shared';
import { SearchService } from './search.service';
import { environment } from '../../../environments/environment';

describe('SearchService', () => {
  let service: SearchService;
  let httpMock: HttpTestingController;
  const API_URL = `${environment.apiBaseUrl}/search`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('suggest() calls GET /search/suggest?q=<term>', () => {
    const mockResponse: SearchSuggestions = { products: [], vendors: [], categories: [] };

    service.suggest('honey').subscribe((res) => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne((r) => r.url === `${API_URL}/suggest` && r.params.get('q') === 'honey');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
