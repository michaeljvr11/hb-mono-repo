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
  /** Live available stock — the UI clamps steppers against this. Sized items
   *  read this from the selected ProductSize; unsized items from Product. */
  stockQuantity: number;
  /** Primary product image, when one exists. */
  imageUrl?: string;
  /** Server-computed: unitPrice * quantity (display value only). */
  lineTotal: number;
  /** Selected size, when the line is for a sized product (Product Sizing). */
  productSizeId?: string;
  /** Live size label (resolved at read time, never stored) — absent if unsized or the size was since deleted. */
  sizeLabel?: string;
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
  /** Required when the product has sizes; rejected when it does not (Product Sizing). */
  productSizeId?: string;
}

export interface UpdateCartItemRequest {
  quantity: number;
}
