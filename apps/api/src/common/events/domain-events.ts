import { VendorStatus } from '@hb/shared';

/**
 * In-process domain events (EventEmitter2). Best-effort by design — the daily
 * full reindex is the consistency safety net, so a lost event self-heals.
 * Emitters: ProductsService, VendorsService. Listener: SearchIndexerService.
 */
export const ProductEvents = {
  CREATED: 'product.created',
  UPDATED: 'product.updated',
  DELETED: 'product.deleted',
} as const;

export interface ProductChangedEvent {
  productId: string;
}

export const VendorEvents = {
  STATUS_CHANGED: 'vendor.status.changed',
} as const;

export interface VendorStatusChangedEvent {
  vendorId: string;
  status: VendorStatus;
}

/**
 * Emitter: OrdersService (the `capturePayment` PAID branch, after the order
 * is saved `confirmed`). Listener: OrderNotificationsListener. Best-effort
 * by design, same as the events above — BUT unlike SearchIndexerService
 * there is no daily-reindex-style safety net here: nothing re-derives or
 * re-sends a missed notification later. A lost `order.paid` event is a
 * silently lost vendor/platform email, not a stale-then-healed read model.
 * Documented v1 trade-off — acceptable because email delivery is advisory
 * (order state itself is unaffected), revisit if notifications become
 * load-bearing.
 */
export const OrderEvents = {
  PAID: 'order.paid',
} as const;

export interface OrderPaidEvent {
  orderId: string;
}
