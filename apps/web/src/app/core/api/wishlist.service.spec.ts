import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CurrencyCode, WishlistDto } from '@hb/shared';

import { WishlistService } from './wishlist.service';
import { environment } from '../../../environments/environment';

const WISHLIST: WishlistDto = {
  items: [
    {
      id: 'wi-1',
      productId: 'p1',
      productName: 'Fynbos Honey',
      price: 185,
      currency: CurrencyCode.ZAR,
      stockQuantity: 10,
      hasSizes: false,
      addedAt: '2026-07-07T09:00:00.000Z',
    },
  ],
  itemCount: 1,
};

describe('WishlistService', () => {
  let service: WishlistService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WishlistService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('starts with no wishlist and a zero item count', () => {
    expect(service.wishlist()).toBeNull();
    expect(service.itemCount()).toBe(0);
  });

  it('has() is false for any product id when the wishlist is null', () => {
    expect(service.has('p1')).toBe(false);
  });

  it('load() GETs the wishlist and updates the shared signal', () => {
    service.load().subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/wishlist`);
    expect(req.request.method).toBe('GET');
    req.flush(WISHLIST);

    expect(service.wishlist()).toEqual(WISHLIST);
    expect(service.itemCount()).toBe(1);
  });

  it('add() POSTs the productId and stores the returned wishlist', () => {
    service.add('p1').subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/wishlist/items`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ productId: 'p1' });
    req.flush(WISHLIST);

    expect(service.itemCount()).toBe(1);
  });

  it('remove() DELETEs by productId and stores the returned wishlist', () => {
    service.remove('p1').subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/wishlist/items/p1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ items: [], itemCount: 0 });

    expect(service.itemCount()).toBe(0);
  });

  it('has() reflects membership from the loaded wishlist', () => {
    service.load().subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/wishlist`).flush(WISHLIST);

    expect(service.has('p1')).toBe(true);
    expect(service.has('unknown-product')).toBe(false);
  });

  it('toggle() calls add() when the product is not yet a member', () => {
    service.toggle('p1').subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/wishlist/items`);
    expect(req.request.method).toBe('POST');
    req.flush(WISHLIST);
  });

  it('toggle() calls remove() when the product is already a member', () => {
    service.load().subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/wishlist`).flush(WISHLIST);

    service.toggle('p1').subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/wishlist/items/p1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ items: [], itemCount: 0 });
  });

  it('reset() drops local state (badge back to 0)', () => {
    service.load().subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/wishlist`).flush(WISHLIST);
    expect(service.itemCount()).toBe(1);

    service.reset();

    expect(service.wishlist()).toBeNull();
    expect(service.itemCount()).toBe(0);
  });
});
