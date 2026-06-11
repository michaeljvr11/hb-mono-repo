import { CountryCode, CurrencyCode, ListingType, OrderStatus } from '../enums';
import { AddressDto } from './address';

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
