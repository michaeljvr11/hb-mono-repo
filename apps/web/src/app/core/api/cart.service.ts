import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AddCartItemRequest, CartDto, UpdateCartItemRequest } from '@hb/shared';
import { environment } from '../../../environments/environment';

/**
 * Server-side cart client + shared cart state. Every mutation returns the
 * fresh server cart, so the `cart` signal (and the nav badge derived from it)
 * always reflects API truth — totals are display-only values computed by the
 * API from live product prices, never recomputed client-side.
 */
@Injectable({
  providedIn: 'root',
})
export class CartService {
  private readonly http = inject(HttpClient);
  private readonly API_URL = `${environment.apiBaseUrl}/cart`;

  /** Last cart state received from the API (null until first load). */
  readonly cart = signal<CartDto | null>(null);

  /** Units across all lines — drives the nav-bar / radial-nav badge. */
  readonly itemCount = computed(() => this.cart()?.itemCount ?? 0);

  load(): Observable<CartDto> {
    return this.http.get<CartDto>(this.API_URL).pipe(tap((cart) => this.cart.set(cart)));
  }

  addItem(productId: string, quantity = 1): Observable<CartDto> {
    const body: AddCartItemRequest = { productId, quantity };
    return this.http
      .post<CartDto>(`${this.API_URL}/items`, body)
      .pipe(tap((cart) => this.cart.set(cart)));
  }

  updateItem(itemId: string, quantity: number): Observable<CartDto> {
    const body: UpdateCartItemRequest = { quantity };
    return this.http
      .patch<CartDto>(`${this.API_URL}/items/${itemId}`, body)
      .pipe(tap((cart) => this.cart.set(cart)));
  }

  removeItem(itemId: string): Observable<CartDto> {
    return this.http
      .delete<CartDto>(`${this.API_URL}/items/${itemId}`)
      .pipe(tap((cart) => this.cart.set(cart)));
  }

  /** Drop local state (logout / after checkout clears the server cart). */
  reset(): void {
    this.cart.set(null);
  }
}
