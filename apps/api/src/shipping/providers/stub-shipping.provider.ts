import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CurrencyCode, ShipmentStatus, ShippingQuote, ShippingQuoteRequest } from '@hb/shared';
import {
  CreateShipmentRequest,
  ShipmentBooking,
  ShippingProviderPort,
} from '../shipping-provider.port';

/**
 * Canned-response provider so order/fulfilment flows can be built before a
 * courier is chosen. Quotes a flat rate, higher for the cross-border leg.
 */
@Injectable()
export class StubShippingProvider implements ShippingProviderPort {
  private readonly logger = new Logger(StubShippingProvider.name);

  async getQuote(request: ShippingQuoteRequest): Promise<ShippingQuote> {
    const crossBorder = request.fromCountry !== request.toCountry;
    return {
      provider: 'stub',
      amount: crossBorder ? 250 : 90,
      currency: CurrencyCode.ZAR,
      crossBorder,
      estimatedDays: crossBorder ? 7 : 3,
    };
  }

  async createShipment(request: CreateShipmentRequest): Promise<ShipmentBooking> {
    this.logger.warn(
      `STUB shipment booked for order ${request.orderId}: ${request.fromCountry} → ${request.toCountry}`,
    );
    return {
      provider: 'stub',
      trackingReference: `stub_${randomUUID()}`,
    };
  }

  async trackShipment(): Promise<ShipmentStatus> {
    return ShipmentStatus.PENDING;
  }
}
