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
  /**
   * GROSS line GMV of platform-fulfilled order lines, grouped by currency —
   * NOT net revenue (no commission concept applies to platform lines in the
   * first place). For the accounting-accurate admin earnings split (fees
   * actually earned, money held for vendors), see `AdminEarningsReportDto`.
   */
  platformRevenue: CurrencyTotalDto[];
  /**
   * GROSS line GMV of vendor-fulfilled order lines, grouped by currency —
   * NOT net-of-commission revenue. Vendors keep the commission-adjusted net,
   * H&B earns only the commission portion; see `AdminEarningsReportDto` for
   * those accounting-accurate figures.
   */
  vendorRevenue: CurrencyTotalDto[];
}
