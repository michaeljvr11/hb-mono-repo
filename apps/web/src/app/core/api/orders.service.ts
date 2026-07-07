import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateOrderRequest, OrderDto } from '@hb/shared';
import { environment } from '../../../environments/environment';

/**
 * Customer order client. Order creation sends ONLY the shipping address —
 * lines come from the server-side cart and all totals are computed by the
 * API (a client-submitted total would never be trusted anyway).
 */
@Injectable({
  providedIn: 'root',
})
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly API_URL = `${environment.apiBaseUrl}/orders`;

  create(request: CreateOrderRequest): Observable<OrderDto> {
    return this.http.post<OrderDto>(this.API_URL, request);
  }

  list(): Observable<OrderDto[]> {
    return this.http.get<OrderDto[]>(this.API_URL);
  }

  getById(id: string): Observable<OrderDto> {
    return this.http.get<OrderDto>(`${this.API_URL}/${id}`);
  }
}
