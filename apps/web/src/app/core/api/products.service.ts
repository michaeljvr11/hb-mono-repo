import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ProductCreateRequest,
  ProductDto as Product,
  ProductQuery,
  ProductUpdateRequest,
} from '@hb/shared';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ProductsService {
  private readonly API_URL = `${environment.apiBaseUrl}/products`;

  constructor(private http: HttpClient) {}

  /** Discovery listing. Omits empty/undefined query params rather than sending them blank. */
  list(query?: ProductQuery): Observable<Product[]> {
    let params = new HttpParams();
    if (query?.categoryId) {
      params = params.set('categoryId', query.categoryId);
    }
    if (query?.q) {
      params = params.set('q', query.q);
    }
    if (query?.vendorId) {
      params = params.set('vendorId', query.vendorId);
    }
    return this.http.get<Product[]>(this.API_URL, { params });
  }

  getById(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.API_URL}/${id}`);
  }

  create(data: ProductCreateRequest, images: File[] = []): Observable<Product> {
    if (!images.length) {
      return this.http.post<Product>(this.API_URL, data);
    }

    const formData = this.toFormData(data, images);
    return this.http.post<Product>(this.API_URL, formData);
  }

  update(id: string, data: ProductUpdateRequest): Observable<Product> {
    return this.http.patch<Product>(`${this.API_URL}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/${id}`);
  }

  private toFormData(data: ProductCreateRequest, images: File[]): FormData {
    const formData = new FormData();

    formData.append('name', data.name);
    formData.append('description', data.description);
    formData.append('price', String(data.price));

    if (data.stockQuantity !== undefined) {
      formData.append('stockQuantity', String(data.stockQuantity));
    }

    if (data.vendorId) {
      formData.append('vendorId', data.vendorId);
    }

    data.categoryIds?.forEach(categoryId => formData.append('categoryIds', categoryId));
    images.forEach(image => formData.append('images', image));

    return formData;
  }
}
