import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CartDto, CurrencyCode } from '@hb/shared';

import { CartService } from './cart.service';
import { environment } from '../../../environments/environment';

const CART: CartDto = {
  id: 'cart-1',
  items: [
    {
      id: 'item-1',
      productId: 'p1',
      quantity: 2,
      productName: 'Fynbos Honey',
      unitPrice: 185,
      currency: CurrencyCode.ZAR,
      stockQuantity: 10,
      lineTotal: 370,
    },
  ],
  totals: [{ currency: CurrencyCode.ZAR, subtotal: 370 }],
  itemCount: 2,
  updatedAt: '2026-07-07T09:00:00.000Z',
};

describe('CartService', () => {
  let service: CartService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CartService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('starts with no cart and a zero item count', () => {
    expect(service.cart()).toBeNull();
    expect(service.itemCount()).toBe(0);
  });

  it('load() GETs the cart and updates the shared signal', () => {
    service.load().subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart`);
    expect(req.request.method).toBe('GET');
    req.flush(CART);

    expect(service.cart()).toEqual(CART);
    expect(service.itemCount()).toBe(2);
  });

  it('addItem() POSTs productId + quantity and stores the returned cart', () => {
    service.addItem('p1', 3).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart/items`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ productId: 'p1', quantity: 3 });
    req.flush(CART);

    expect(service.itemCount()).toBe(2);
  });

  it('addItem() defaults to quantity 1', () => {
    service.addItem('p1').subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart/items`);
    expect(req.request.body).toEqual({ productId: 'p1', quantity: 1 });
    req.flush(CART);
  });

  it('updateItem() PATCHes the line quantity', () => {
    service.updateItem('item-1', 5).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart/items/item-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ quantity: 5 });
    req.flush(CART);
  });

  it('removeItem() DELETEs the line and stores the fresh cart', () => {
    service.removeItem('item-1').subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/cart/items/item-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ ...CART, items: [], totals: [], itemCount: 0 });

    expect(service.itemCount()).toBe(0);
  });

  it('reset() drops local state (badge back to 0)', () => {
    service.load().subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/cart`).flush(CART);
    expect(service.itemCount()).toBe(2);

    service.reset();

    expect(service.cart()).toBeNull();
    expect(service.itemCount()).toBe(0);
  });
});
