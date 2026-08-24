import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateShippingFeeSetRequest,
  CurrentShippingFeeDto,
  GetCurrentShippingFeeQuery,
  ShippingFeeHistoryDto,
  ShippingFeeSetDto,
} from '@hb/shared';
import { environment } from '../../../environments/environment';

/**
 * Wraps the SF-1 admin endpoints (`/admin/shipping-fees`) and the SF-3
 * checkout-preview endpoint (`/shipping-fee/current`, NOT under `/admin` —
 * it is authenticated but not role-gated). SF-4 (checkout) consumes only
 * `current()`; this admin screen consumes `list()`/`create()`.
 */
@Injectable({ providedIn: 'root' })
export class ShippingFeeService {
  private readonly http = inject(HttpClient);
  private readonly adminBase = `${environment.apiBaseUrl}/admin`;
  private readonly base = environment.apiBaseUrl;

  list(): Observable<ShippingFeeHistoryDto> {
    return this.http.get<ShippingFeeHistoryDto>(`${this.adminBase}/shipping-fees`);
  }

  create(data: CreateShippingFeeSetRequest): Observable<ShippingFeeSetDto> {
    return this.http.post<ShippingFeeSetDto>(`${this.adminBase}/shipping-fees`, data);
  }

  current(query: GetCurrentShippingFeeQuery): Observable<CurrentShippingFeeDto> {
    const params = new HttpParams()
      .set('originCountry', query.originCountry)
      .set('destinationCountry', query.destinationCountry)
      .set('currency', query.currency);
    return this.http.get<CurrentShippingFeeDto>(`${this.base}/shipping-fee/current`, { params });
  }
}
