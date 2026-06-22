import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminDashboardDto,
  AdminOrderListDto,
  AdminOrderListQuery,
} from '@hb/shared';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  getDashboard(): Observable<AdminDashboardDto> {
    return this.http.get<AdminDashboardDto>(`${this.base}/dashboard`);
  }

  listOrders(query?: AdminOrderListQuery): Observable<AdminOrderListDto> {
    let params = new HttpParams();

    if (query) {
      if (query.status !== undefined) {
        params = params.set('status', query.status);
      }
      if (query.vendorId !== undefined) {
        params = params.set('vendorId', query.vendorId);
      }
      if (query.page !== undefined) {
        params = params.set('page', String(query.page));
      }
      if (query.limit !== undefined) {
        params = params.set('limit', String(query.limit));
      }
    }

    return this.http.get<AdminOrderListDto>(`${this.base}/orders`, { params });
  }
}
