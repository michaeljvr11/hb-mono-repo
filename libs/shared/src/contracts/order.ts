import { CountryCode, CurrencyCode, ListingType, OrderStatus } from '../enums';
import { AddressDto, CreateAddressRequest } from './address';

/**
 * Checkout submission. The order's lines come from the caller's server-side
 * cart; totals are ALWAYS computed server-side from live product prices —
 * a client-submitted total is never accepted.
 */
export interface CreateOrderRequest {
  shippingAddress: CreateAddressRequest;
}

/** Body for PATCH /orders/:id/status. Every transition is validated in the
 *  service layer against the Order State Machine — no direct status writes. */
export interface UpdateOrderStatusRequest {
  status: OrderStatus;
}

/**
 * Body for PATCH /orders/:id/status-override. Admin-only escape hatch that
 * bypasses the normal state machine (ORDER_STATUS_TRANSITIONS) entirely —
 * any status to any status, including re-entering/leaving terminal states.
 * `sendNotifications` has no server-side default: the checkbox state is
 * always sent explicitly (Order State Machine: "Notification-suppression
 * question — resolved 2026-08-16").
 */
export interface OrderStatusOverrideRequest {
  status: OrderStatus;
  reason: string;
  sendNotifications: boolean;
}

/** One row of override history for the admin order-detail audit view. */
export interface OrderStatusOverrideAuditDto {
  id: string;
  orderId: string;
  adminUserId: string;
  adminEmail?: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  reason: string;
  sendNotifications: boolean;
  createdAt: string;
}

/** One row in the admin order-oversight list (summary, not full detail). */
export interface AdminOrderListItemDto {
  id: string;
  status: OrderStatus;
  currency: CurrencyCode;
  total: number;
  customerId: string;
  customerEmail: string;
  customerName?: string;
  /** Distinct vendor ids on the order's lines (empty for all-platform orders). */
  vendorIds: string[];
  itemCount: number;
  originCountry: CountryCode;
  destinationCountry: CountryCode;
  createdAt: string;
  updatedAt: string;
}

/** Paginated admin order-list response. */
export interface AdminOrderListDto {
  items: AdminOrderListItemDto[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

/** Query params for GET /admin/orders. */
export interface AdminOrderListQuery {
  status?: OrderStatus;
  vendorId?: string;
  page?: number;
  limit?: number;
}

export interface OrderItemDto {
  id: string;
  /** Snapshot reference; the product row may change or be removed later. */
  productId?: string;
  productName: string;
  unitPrice: number;
  currency: CurrencyCode;
  quantity: number;
  listingType: ListingType;
  /** Absent for platform (first-party) items. */
  vendorId?: string;
  /** Snapshot of the selected size's label at purchase time (Product Sizing) — absent for unsized lines. */
  sizeLabel?: string;
}

/**
 * One order-line row scoped to the calling vendor — the read model behind
 * GET /orders/vendor (Vendor & Admin Portals: "own order lines" ownership).
 * Status changes reuse PATCH /orders/:id/status (UpdateOrderStatusRequest);
 * there is no separate vendor-fulfilment update DTO.
 */
export interface VendorOrderLineDto {
  /** order_items row id. */
  id: string;
  orderId: string;
  orderStatus: OrderStatus;
  orderCreatedAt: string;
  productName: string;
  unitPrice: number;
  currency: CurrencyCode;
  quantity: number;
}

export interface OrderDto {
  id: string;
  status: OrderStatus;
  currency: CurrencyCode;
  subtotal: number;
  shippingTotal: number;
  total: number;
  /** Where the goods leave from (typically ZA). */
  originCountry: CountryCode;
  /** Where the goods are delivered (ZA domestic or NA cross-border). */
  destinationCountry: CountryCode;
  shippingAddress?: AddressDto;
  items: OrderItemDto[];
  createdAt: string;
  updatedAt: string;
}
