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

  getQuote(request: ShippingQuoteRequest): Promise<ShippingQuote> {
    const crossBorder = request.fromCountry !== request.toCountry;
    return Promise.resolve({
      provider: 'stub',
      amount: crossBorder ? 250 : 90,
      currency: CurrencyCode.ZAR,
      crossBorder,
      estimatedDays: crossBorder ? 7 : 3,
    });
  }

  createShipment(request: CreateShipmentRequest): Promise<ShipmentBooking> {
    this.logger.warn(
      `STUB shipment booked for order ${request.orderId}: ${request.fromCountry} → ${request.toCountry}`,
    );
    return Promise.resolve({
      provider: 'stub',
      trackingReference: `stub_${randomUUID()}`,
    });
  }

  trackShipment(): Promise<ShipmentStatus> {
    return Promise.resolve(ShipmentStatus.PENDING);
  }
}
