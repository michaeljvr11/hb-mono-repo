import { CountryCode, CurrencyCode, ShipmentStatus } from '../enums';

export interface ShipmentDto {
  id: string;
  orderId: string;
  provider: string;
  trackingReference?: string;
  status: ShipmentStatus;
  fromCountry: CountryCode;
  toCountry: CountryCode;
  /** Customs/clearance reference for the ZA → NA leg. */
  customsReference?: string;
  createdAt: string;
}

export interface ShippingQuoteRequest {
  fromCountry: CountryCode;
  toCountry: CountryCode;
  /** Total parcel weight in kg; enough for a skeleton quote shape. */
  weightKg?: number;
}

export interface ShippingQuote {
  provider: string;
  amount: number;
  currency: CurrencyCode;
  crossBorder: boolean;
  estimatedDays: number;
}
