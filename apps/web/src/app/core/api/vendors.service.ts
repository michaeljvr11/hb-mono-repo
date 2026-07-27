import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminCreateVendorRequest,
  AdminVendorDto,
  CreateVendorRequest,
  UpdateVendorRequest,
  UpdateVendorStatusRequest,
  VendorAnalyticsDto,
  VendorAnalyticsQuery,
  VendorDashboardDto,
  VendorDto as Vendor,
  VendorSelfDto,
} from '@hb/shared';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VendorsService {
  private readonly API_URL = `${environment.apiBaseUrl}/vendors`;

  constructor(private http: HttpClient) {}

  list(): Observable<AdminVendorDto[]> {
    return this.http.get<AdminVendorDto[]>(this.API_URL);
  }

  getById(id: string): Observable<Vendor> {
    return this.http.get<Vendor>(`${this.API_URL}/${id}`);
  }

  getMe(): Observable<VendorSelfDto> {
    return this.http.get<VendorSelfDto>(`${this.API_URL}/me`);
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

  /** Multipart upload — field name `file`, matches the server's multer config. */
  uploadLogo(file: File): Observable<VendorSelfDto> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<VendorSelfDto>(`${this.API_URL}/me/logo`, formData);
  }

  /** Multipart upload — field name `file`, matches the server's multer config. */
  uploadBanner(file: File): Observable<VendorSelfDto> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<VendorSelfDto>(`${this.API_URL}/me/banner`, formData);
  }

  updateStatus(id: string, data: UpdateVendorStatusRequest): Observable<Vendor> {
    return this.http.patch<Vendor>(`${this.API_URL}/${id}/status`, data);
  }

  directory(): Observable<Vendor[]> {
    return this.http.get<Vendor[]>(`${this.API_URL}/directory`);
  }

  getDashboard(): Observable<VendorDashboardDto> {
    return this.http.get<VendorDashboardDto>(`${this.API_URL}/me/dashboard`);
  }

  getAnalytics(query?: VendorAnalyticsQuery): Observable<VendorAnalyticsDto> {
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

    return this.http.get<VendorAnalyticsDto>(`${this.API_URL}/me/analytics`, { params });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/${id}`);
  }
}
