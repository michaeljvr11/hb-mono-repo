import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AddressDto, CreateAddressRequest } from '@hb/shared';
import { environment } from '../../../environments/environment';

/** Address book client — the caller's own saved addresses (profile management). */
@Injectable({
  providedIn: 'root',
})
export class AddressesService {
  private readonly http = inject(HttpClient);
  private readonly API_URL = `${environment.apiBaseUrl}/addresses`;

  list(): Observable<AddressDto[]> {
    return this.http.get<AddressDto[]>(this.API_URL);
  }

  create(data: CreateAddressRequest): Observable<AddressDto> {
    return this.http.post<AddressDto>(this.API_URL, data);
  }

  update(id: string, data: Partial<CreateAddressRequest>): Observable<AddressDto> {
    return this.http.patch<AddressDto>(`${this.API_URL}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/${id}`);
  }
}
