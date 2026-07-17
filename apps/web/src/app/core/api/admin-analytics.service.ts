import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminAnalyticsQuery, AdminAnalyticsSummaryDto } from '@hb/shared';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminAnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  getSummary(query?: AdminAnalyticsQuery): Observable<AdminAnalyticsSummaryDto> {
    let params = new HttpParams();

    if (query) {
      if (query.from !== undefined) {
        params = params.set('from', query.from);
      }
      if (query.to !== undefined) {
        params = params.set('to', query.to);
      }
      if (query.granularity !== undefined) {
        params = params.set('granularity', query.granularity);
      }
    }

    return this.http.get<AdminAnalyticsSummaryDto>(`${this.base}/analytics`, { params });
  }
}
