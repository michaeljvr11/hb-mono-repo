import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ContactInquiryDto, CreateContactInquiryRequest } from '@hb/shared';
import { environment } from '../../../environments/environment';

/**
 * Thin client for the `/contact` form (LSM-4) — the seam with the API's
 * inquiries endpoint (LSM-5). No local state: a contact inquiry is a one-shot
 * write, not something the UI needs to keep a signal of afterwards.
 */
@Injectable({
  providedIn: 'root',
})
export class ContactService {
  private readonly http = inject(HttpClient);
  private readonly API_URL = `${environment.apiBaseUrl}/inquiries`;

  create(request: CreateContactInquiryRequest): Observable<ContactInquiryDto> {
    return this.http.post<ContactInquiryDto>(this.API_URL, request);
  }
}
