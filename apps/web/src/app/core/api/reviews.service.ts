import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ProductReviewListDto, ProductReviewQuery } from '@hb/shared';
import { environment } from '../../../environments/environment';

/**
 * Public read client for product reviews (`GET /products/:productId/reviews`
 * is `@Public()` — no auth header required, safe to call during SSR). Mirrors
 * the `WishlistService`/`CartService` shape: the last page fetched is kept in
 * a signal, though — unlike cart/wishlist — reviews are page-scoped, so
 * `ProductDetail` also tracks its own loading/error state per fetch rather
 * than reading this signal directly.
 */
@Injectable({
  providedIn: 'root',
})
export class ReviewsService {
  private readonly http = inject(HttpClient);
  private readonly API_URL = `${environment.apiBaseUrl}/products`;

  /** Last review page received from the API (null until first load). */
  readonly reviews = signal<ProductReviewListDto | null>(null);

  /** Omits empty/undefined query params rather than sending them blank. */
  getReviews(productId: string, query?: ProductReviewQuery): Observable<ProductReviewListDto> {
    let params = new HttpParams();
    if (query?.page) {
      params = params.set('page', String(query.page));
    }
    if (query?.limit) {
      params = params.set('limit', String(query.limit));
    }
    if (query?.sort) {
      params = params.set('sort', query.sort);
    }
    return this.http
      .get<ProductReviewListDto>(`${this.API_URL}/${productId}/reviews`, { params })
      .pipe(tap((res) => this.reviews.set(res)));
  }
}
