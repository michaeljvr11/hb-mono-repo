import { CountryCode, ShipmentStatus, ShippingQuote, ShippingQuoteRequest } from '@hb/shared';

/**
 * Port for courier/logistics providers (hexagonal seam).
 * Choosing a real provider (ShipLogic, Aramex, own fleet, …) is a future
 * decision — checkout/fulfilment code depends only on this interface and
 * the SHIPPING_PROVIDER token.
 */
export const SHIPPING_PROVIDER = Symbol('SHIPPING_PROVIDER');

export interface CreateShipmentRequest {
  orderId: string;
  fromCountry: CountryCode;
  toCountry: CountryCode;
  weightKg?: number;
}

export interface ShipmentBooking {
  provider: string;
  trackingReference: string;
}

export interface ShippingProviderPort {
  getQuote(request: ShippingQuoteRequest): Promise<ShippingQuote>;
  createShipment(request: CreateShipmentRequest): Promise<ShipmentBooking>;
  trackShipment(trackingReference: string): Promise<ShipmentStatus>;
}
