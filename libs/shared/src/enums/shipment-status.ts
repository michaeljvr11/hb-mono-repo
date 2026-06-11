/**
 * Shipment lifecycle including the cross-border leg (ZA → NA).
 * AT_BORDER / CUSTOMS_CLEARED exist because customs is a first-class
 * step in this business, even inside the SACU customs union.
 */
export const ShipmentStatus = {
  PENDING: 'pending',
  BOOKED: 'booked',
  IN_TRANSIT: 'in_transit',
  AT_BORDER: 'at_border',
  CUSTOMS_CLEARED: 'customs_cleared',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  FAILED: 'failed',
} as const;
export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus];
