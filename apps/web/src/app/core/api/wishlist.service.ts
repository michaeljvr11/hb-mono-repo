import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AddWishlistItemRequest, WishlistDto } from '@hb/shared';
import { environment } from '../../../environments/environment';

/**
 * Server-side wishlist client + shared wishlist state. Every mutation
 * returns the fresh server wishlist, so the `wishlist` signal always
 * reflects API truth — a wishlist item has no quantity/price snapshot,
 * `productName`/`price`/`stockQuantity` are read live at response time.
 */
@Injectable({
  providedIn: 'root',
})
export class WishlistService {
  private readonly http = inject(HttpClient);
  private readonly API_URL = `${environment.apiBaseUrl}/wishlist`;

  /** Last wishlist state received from the API (null until first load). */
  readonly wishlist = signal<WishlistDto | null>(null);

  /** Row count across all lines — drives the nav-bar / radial-nav badge. */
  readonly itemCount = computed(() => this.wishlist()?.itemCount ?? 0);

  /** Product ids on the wishlist, derived once so `has()` is O(1) per card. */
  private readonly productIds = computed(
    () => new Set(this.wishlist()?.items.map((item) => item.productId) ?? []),
  );

  load(): Observable<WishlistDto> {
    return this.http
      .get<WishlistDto>(this.API_URL)
      .pipe(tap((wishlist) => this.wishlist.set(wishlist)));
  }

  add(productId: string): Observable<WishlistDto> {
    const body: AddWishlistItemRequest = { productId };
    return this.http
      .post<WishlistDto>(`${this.API_URL}/items`, body)
      .pipe(tap((wishlist) => this.wishlist.set(wishlist)));
  }

  remove(productId: string): Observable<WishlistDto> {
    return this.http
      .delete<WishlistDto>(`${this.API_URL}/items/${productId}`)
      .pipe(tap((wishlist) => this.wishlist.set(wishlist)));
  }

  /** Adds or removes `productId` depending on current membership. */
  toggle(productId: string): Observable<WishlistDto> {
    return this.has(productId) ? this.remove(productId) : this.add(productId);
  }

  /** O(1) membership check backed by the derived product-id set. */
  has(productId: string): boolean {
    return this.productIds().has(productId);
  }

  /** Drop local state (logout — mirrors CartService.reset()). */
  reset(): void {
    this.wishlist.set(null);
  }
}
