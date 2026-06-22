import { CurrencyCode, OrderStatus } from '../enums';

/** A money total in a single currency. ZAR and NAD are reported separately —
 *  the 1:1 peg is data, never assumed (see Money & Currency Rules). */
export interface CurrencyTotalDto {
  currency: CurrencyCode;
  /**
   * numeric(12,2): sum of line totals (unitPrice * quantity) in this currency.
   * Order-level shipping (`shippingTotal`) is intentionally NOT included — this is
   * goods/GMV revenue from order lines only, so it will not equal a sum of `order.total`.
   */
  amount: number;
}

export interface OrderStatusCountDto {
  status: OrderStatus;
  count: number;
}

/** Admin dashboard read-model — platform-wide metrics. */
export interface AdminDashboardDto {
  /** Vendors awaiting approval (vendor status = pending). */
  pendingVendorCount: number;
  /** Total number of orders (all statuses). */
  totalOrders: number;
  /** Count of orders per status — every OrderStatus present and zero-filled. */
  orderCountsByStatus: OrderStatusCountDto[];
  /** Revenue from platform-fulfilled order lines, grouped by currency. */
  platformRevenue: CurrencyTotalDto[];
  /** Revenue from vendor-fulfilled order lines, grouped by currency. */
  vendorRevenue: CurrencyTotalDto[];
}
