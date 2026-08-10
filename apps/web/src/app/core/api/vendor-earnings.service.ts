import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { VendorEarningsQuery, VendorEarningsReportDto } from '@hb/shared';
import { environment } from '../../../environments/environment';

/** Vendor-facing wrapper for GET /vendors/me/earnings — mirrors `AdminEarningsService`'s
 *  param-building pattern exactly. Deliberately has no `vendorId` param: the endpoint always
 *  resolves the caller's own vendor scope server-side (see `VendorEarningsQuery`). */
@Injectable({ providedIn: 'root' })
export class VendorEarningsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/vendors`;

  getReport(query?: VendorEarningsQuery): Observable<VendorEarningsReportDto> {
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
    }

    return this.http.get<VendorEarningsReportDto>(`${this.base}/me/earnings`, { params });
  }
}
