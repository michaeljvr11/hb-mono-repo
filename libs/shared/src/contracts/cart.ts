import { CurrencyCode } from '../enums';

/**
 * Cart line. The cart stores product refs + quantity only — never money.
 * Price/stock fields below are read LIVE from the product at response time
 * (the cart is a staging area, not a past total; snapshots happen at order
 * creation — see Money & Currency Rules).
 */
export interface CartItemDto {
  id: string;
  productId: string;
  quantity: number;
  /** Live product display data (resolved at read time, never stored). */
  productName: string;
  unitPrice: number;
  currency: CurrencyCode;
  /** Live available stock — the UI clamps steppers against this. */
  stockQuantity: number;
  /** Primary product image, when one exists. */
  imageUrl?: string;
  /** Server-computed: unitPrice * quantity (display value only). */
  lineTotal: number;
}

/** Per-currency running subtotal. ZAR and NAD are never summed together. */
export interface CartTotalDto {
  currency: CurrencyCode;
  subtotal: number;
}

export interface CartDto {
  id: string;
  items: CartItemDto[];
  /** Server-computed per-currency subtotals of the live line prices. */
  totals: CartTotalDto[];
  /** Total number of units across all lines (nav badge count). */
  itemCount: number;
  updatedAt: string;
}

export interface AddCartItemRequest {
  productId: string;
  quantity: number;
}

export interface UpdateCartItemRequest {
  quantity: number;
}
