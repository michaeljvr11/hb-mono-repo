import { CountryCode, CurrencyCode, ListingType, OrderStatus } from '../enums';
import { AddressDto } from './address';

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
