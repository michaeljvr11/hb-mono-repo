import { OrderStatus } from '@hb/shared';

/**
 * Returns the set of next statuses a vendor may trigger for an order line at
 * the given status, per the Order State Machine (Obsidian "Order State
 * Machine.md"): vendors may only trigger confirmed → processing and
 * processing → handed_to_hb. Every other status gets no action — display
 * only. Server-side scope enforcement is the real trust boundary; this is
 * defense in depth / good UX only.
 */
export function vendorActionsFor(status: OrderStatus): OrderStatus[] {
  switch (status) {
    case OrderStatus.CONFIRMED:
      return [OrderStatus.PROCESSING];
    case OrderStatus.PROCESSING:
      return [OrderStatus.HANDED_TO_HB];
    default:
      return [];
  }
}

/** Human-readable label for an action button targeting the given next status. */
export function vendorActionLabel(target: OrderStatus): string {
  switch (target) {
    case OrderStatus.PROCESSING:
      return 'Mark as Processing';
    case OrderStatus.HANDED_TO_HB:
      return 'Mark as Handed to HB';
    default:
      return target;
  }
}
