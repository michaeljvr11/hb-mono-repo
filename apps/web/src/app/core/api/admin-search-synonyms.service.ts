import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SynonymCreateRequest, SynonymDto, SynonymUpdateRequest } from '@hb/shared';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminSearchSynonymsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin/search/synonyms`;

  list(): Observable<SynonymDto[]> {
    return this.http.get<SynonymDto[]>(this.base);
  }

  create(req: SynonymCreateRequest): Observable<SynonymDto> {
    return this.http.post<SynonymDto>(this.base, req);
  }

  update(id: string, req: SynonymUpdateRequest): Observable<SynonymDto> {
    return this.http.patch<SynonymDto>(`${this.base}/${id}`, req);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
