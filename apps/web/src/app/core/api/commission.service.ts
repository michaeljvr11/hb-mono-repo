import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CommissionRateDto, CommissionRateListDto, CreateCommissionRateRequest } from '@hb/shared';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CommissionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  list(): Observable<CommissionRateListDto> {
    return this.http.get<CommissionRateListDto>(`${this.base}/commission-rates`);
  }

  create(data: CreateCommissionRateRequest): Observable<CommissionRateDto> {
    return this.http.post<CommissionRateDto>(`${this.base}/commission-rates`, data);
  }
}
