import { CurrencyCode } from '../enums';

/**
 * Wishlist line. A wishlist is not a staging cart — it holds a product
 * reference only, no quantity. `productName`/`price`/`currency`/
 * `stockQuantity`/`imageUrl` are read LIVE from the product at response
 * time and never stored (see Money & Currency Rules: price snapshots
 * happen at order creation only).
 */
export interface WishlistItemDto {
  id: string;
  productId: string;
  /** Live product display data (resolved at read time, never stored). */
  productName: string;
  price: number;
  currency: CurrencyCode;
  /** Live available stock — the UI disables add-to-cart at zero. */
  stockQuantity: number;
  /** Primary product image, when one exists. */
  imageUrl?: string;
  addedAt: string;
}

export interface WishlistDto {
  items: WishlistItemDto[];
  /** Row count (NOT a unit sum — a wishlist item has no quantity). */
  itemCount: number;
}

export interface AddWishlistItemRequest {
  productId: string;
}
