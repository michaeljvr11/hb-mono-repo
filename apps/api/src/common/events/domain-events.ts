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
