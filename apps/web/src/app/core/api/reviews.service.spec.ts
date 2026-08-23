import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProductReviewListDto, ReviewSort } from '@hb/shared';

import { ReviewsService } from './reviews.service';
import { environment } from '../../../environments/environment';

const REVIEWS: ProductReviewListDto = {
  items: [
    {
      id: 'r1',
      productId: 'p1',
      rating: 5,
      body: 'Great honey.',
      authorName: 'Michael J.',
      isVerifiedPurchase: true,
      createdAt: '2026-07-07T09:00:00.000Z',
      updatedAt: '2026-07-07T09:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 10,
  summary: { averageRating: 5, reviewCount: 1 },
};

describe('ReviewsService', () => {
  let service: ReviewsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReviewsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('starts with no reviews loaded', () => {
    expect(service.reviews()).toBeNull();
  });

  it('getReviews() GETs the product review list with no params when the query is omitted', () => {
    service.getReviews('p1').subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/products/p1/reviews`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush(REVIEWS);

    expect(service.reviews()).toEqual(REVIEWS);
  });

  it('getReviews() sends page/limit/sort as query params when provided', () => {
    service.getReviews('p1', { page: 2, limit: 10, sort: ReviewSort.HIGHEST }).subscribe();

    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/products/p1/reviews?page=2&limit=10&sort=highest`,
    );
    expect(req.request.method).toBe('GET');
    req.flush(REVIEWS);
  });

  it('omits page/limit/sort individually when unset', () => {
    service.getReviews('p1', { limit: 10 }).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/products/p1/reviews?limit=10`);
    req.flush(REVIEWS);
  });
});
