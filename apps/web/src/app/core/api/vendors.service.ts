import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminCreateVendorRequest,
  CreateVendorRequest,
  UpdateVendorRequest,
  UpdateVendorStatusRequest,
  VendorDto as Vendor,
} from '@hb/shared';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VendorsService {
  private readonly API_URL = `${environment.apiBaseUrl}/vendors`;

  constructor(private http: HttpClient) {}

  list(): Observable<Vendor[]> {
    return this.http.get<Vendor[]>(this.API_URL);
  }

  getById(id: string): Observable<Vendor> {
    return this.http.get<Vendor>(`${this.API_URL}/${id}`);
  }

  getMe(): Observable<Vendor> {
    return this.http.get<Vendor>(`${this.API_URL}/me`);
  }

  create(data: CreateVendorRequest): Observable<Vendor> {
    return this.http.post<Vendor>(this.API_URL, data);
  }

  adminCreate(data: AdminCreateVendorRequest): Observable<Vendor> {
    return this.http.post<Vendor>(`${this.API_URL}/admin`, data);
  }

  update(id: string, data: UpdateVendorRequest): Observable<Vendor> {
    return this.http.patch<Vendor>(`${this.API_URL}/${id}`, data);
  }

  updateStatus(id: string, data: UpdateVendorStatusRequest): Observable<Vendor> {
    return this.http.patch<Vendor>(`${this.API_URL}/${id}/status`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/${id}`);
  }
}
