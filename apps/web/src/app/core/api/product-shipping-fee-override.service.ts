import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ProductShippingFeeOverrideDto,
  ProductShippingFeeOverrideRoute,
  SetProductShippingFeeOverrideRequest,
} from '@hb/shared';
import { environment } from '../../../environments/environment';

/**
 * Wraps SF-5's `/admin/products/:productId/shipping-fee-overrides` endpoints
 * (SF-6 admin UI only — the checkout/order path resolves overrides
 * server-side and never calls this).
 */
@Injectable({ providedIn: 'root' })
export class ProductShippingFeeOverrideService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  private overridesUrl(productId: string): string {
    return `${this.base}/admin/products/${productId}/shipping-fee-overrides`;
  }

  /** Only the (route, currency) combinations that actually have an override for this product. */
  list(productId: string): Observable<ProductShippingFeeOverrideDto[]> {
    return this.http.get<ProductShippingFeeOverrideDto[]>(this.overridesUrl(productId));
  }

  /** Upsert — a second call for the same (route, currency) replaces the amount in place. */
  set(
    productId: string,
    data: SetProductShippingFeeOverrideRequest,
  ): Observable<ProductShippingFeeOverrideDto> {
    return this.http.put<ProductShippingFeeOverrideDto>(this.overridesUrl(productId), data);
  }

  /** Idempotent — clearing a combination with no override is a no-op, not an error. */
  clear(productId: string, route: ProductShippingFeeOverrideRoute): Observable<void> {
    const params = new HttpParams()
      .set('originCountry', route.originCountry)
      .set('destinationCountry', route.destinationCountry)
      .set('currency', route.currency);
    return this.http.delete<void>(this.overridesUrl(productId), { params });
  }
}
