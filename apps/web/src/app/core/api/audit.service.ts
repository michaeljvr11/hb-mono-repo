import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuditLogListDto, AuditLogListQuery } from '@hb/shared';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  list(query?: AuditLogListQuery): Observable<AuditLogListDto> {
    let params = new HttpParams();

    if (query) {
      if (query.action !== undefined) {
        params = params.set('action', query.action);
      }
      if (query.entityType !== undefined) {
        params = params.set('entityType', query.entityType);
      }
      if (query.userId !== undefined) {
        params = params.set('userId', query.userId);
      }
      if (query.from !== undefined) {
        params = params.set('from', query.from);
      }
      if (query.to !== undefined) {
        params = params.set('to', query.to);
      }
      if (query.page !== undefined) {
        params = params.set('page', String(query.page));
      }
      if (query.limit !== undefined) {
        params = params.set('limit', String(query.limit));
      }
    }

    return this.http.get<AuditLogListDto>(`${this.base}/audit-logs`, { params });
  }
}
