import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PagedResponse, ProductCreateRequest, ProductDto } from '@hb/shared';
import { ProductsService } from './products.service';
import { environment } from '../../../environments/environment';

const EMPTY_PAGE: PagedResponse<ProductDto> = { items: [], total: 0, page: 1, limit: 24 };

describe('ProductsService', () => {
  let service: ProductsService;
  let httpMock: HttpTestingController;
  const API_URL = `${environment.apiBaseUrl}/products`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProductsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('list() with no args calls GET /products with no query params and returns the paged envelope', () => {
    let result: PagedResponse<ProductDto> | undefined;
    service.list().subscribe((res) => (result = res));

    const req = httpMock.expectOne((r) => r.url === API_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush(EMPTY_PAGE);
    expect(result?.items).toEqual([]);
  });

  it('forwards categoryId, q and vendorId as query params', () => {
    service
      .list({ categoryId: 'cat-1', q: 'honey', vendorId: 'vendor-1' })
      .subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === API_URL &&
        r.params.get('categoryId') === 'cat-1' &&
        r.params.get('q') === 'honey' &&
        r.params.get('vendorId') === 'vendor-1',
    );
    expect(req.request.method).toBe('GET');
    req.flush(EMPTY_PAGE);
  });

  it('forwards page, limit and sort as query params', () => {
    service.list({ page: 2, limit: 100, sort: 'price_asc' }).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === API_URL &&
        r.params.get('page') === '2' &&
        r.params.get('limit') === '100' &&
        r.params.get('sort') === 'price_asc',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ ...EMPTY_PAGE, page: 2, limit: 100 });
  });

  it('omits page, limit and sort when not provided', () => {
    service.list().subscribe();

    const req = httpMock.expectOne((r) => r.url === API_URL);
    expect(req.request.params.has('page')).toBe(false);
    expect(req.request.params.has('limit')).toBe(false);
    expect(req.request.params.has('sort')).toBe(false);
    req.flush(EMPTY_PAGE);
  });

  it('omits empty/undefined query params rather than sending them blank', () => {
    service.list({ categoryId: '', q: undefined, vendorId: undefined }).subscribe();

    const req = httpMock.expectOne((r) => r.url === API_URL);
    expect(req.request.params.keys().length).toBe(0);
    req.flush(EMPTY_PAGE);
  });

  it('getById() calls GET /products/:id', () => {
    service.getById('p1').subscribe();

    const req = httpMock.expectOne(`${API_URL}/p1`);
    expect(req.request.method).toBe('GET');
    req.flush({} as ProductDto);
  });

  it('create() with images and sizes appends the JSON-stringified sizes to the FormData', () => {
    const data: ProductCreateRequest = {
      name: 'Honey',
      description: 'Raw honey',
      price: 100,
      categoryIds: ['cat-1'],
      sizes: [
        { label: 'Small', stockQuantity: 5, displayOrder: 0 },
        { label: 'Large', stockQuantity: 3, displayOrder: 1 },
      ],
    };
    const images = [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })];

    service.create(data, images).subscribe();

    const req = httpMock.expectOne(API_URL);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect(body.get('sizes')).toBe(JSON.stringify(data.sizes));
    expect(body.getAll('categoryIds')).toEqual(['cat-1']);
    expect(body.getAll('images').length).toBe(1);
    req.flush({} as ProductDto);
  });

  it('create() with images but no sizes omits the sizes field from the FormData', () => {
    const data: ProductCreateRequest = {
      name: 'Honey',
      description: 'Raw honey',
      price: 100,
    };
    const images = [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })];

    service.create(data, images).subscribe();

    const req = httpMock.expectOne(API_URL);
    const body = req.request.body as FormData;
    expect(body.has('sizes')).toBe(false);
    req.flush({} as ProductDto);
  });
});
