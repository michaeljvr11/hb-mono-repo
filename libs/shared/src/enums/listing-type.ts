/**
 * The two business models that share this codebase:
 * - PLATFORM: first-party listing — HB sources the product and arranges
 *   cross-border fulfilment itself (no vendor attached).
 * - VENDOR: third-party marketplace listing — a vendor owns the product
 *   and fulfils the order.
 */
export const ListingType = {
  PLATFORM: 'platform',
  VENDOR: 'vendor',
} as const;
export type ListingType = (typeof ListingType)[keyof typeof ListingType];
