import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SearchSuggestions } from '@hb/shared';
import { environment } from '../../../environments/environment';

/**
 * Backs the storefront omnibox (`app-search-bar`). Suggestions are grouped
 * and pre-capped server-side (top 5 per group) — this service just forwards
 * the term.
 */
@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private readonly API_URL = `${environment.apiBaseUrl}/search`;

  constructor(private http: HttpClient) {}

  suggest(q: string): Observable<SearchSuggestions> {
    const params = new HttpParams().set('q', q);
    return this.http.get<SearchSuggestions>(`${this.API_URL}/suggest`, { params });
  }
}
