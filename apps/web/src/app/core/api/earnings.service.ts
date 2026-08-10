import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminEarningsQuery, AdminEarningsReportDto } from '@hb/shared';
import { environment } from '../../../environments/environment';

/** Admin-facing wrapper for GET /admin/earnings. Named `AdminEarningsService` to match this
 *  app's `AdminAnalyticsService` convention — distinct from any API-side class of the same
 *  name, which lives in a different layer/repo. */
@Injectable({ providedIn: 'root' })
export class AdminEarningsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  getReport(query?: AdminEarningsQuery): Observable<AdminEarningsReportDto> {
    let params = new HttpParams();

    if (query) {
      if (query.window !== undefined) {
        params = params.set('window', query.window);
      }
      if (query.from !== undefined) {
        params = params.set('from', query.from);
      }
      if (query.to !== undefined) {
        params = params.set('to', query.to);
      }
      if (query.vendorId !== undefined) {
        params = params.set('vendorId', query.vendorId);
      }
    }

    return this.http.get<AdminEarningsReportDto>(`${this.base}/earnings`, { params });
  }
}
