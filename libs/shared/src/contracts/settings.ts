/**
 * Platform-wide settings (TE-2 spec: "Transactional Email & Order
 * Notifications"). Single-row, typed-column table — NOT a generic
 * key/value bag and NOT an append-only history like `commission_rates`;
 * there is no historical resolution need here, just "the current value".
 * Kept narrow on purpose so future settings land as new columns/fields
 * rather than widening this into a catch-all.
 */
export interface PlatformSettingsDto {
  /**
   * Recipients for platform ops order-notification emails (TE-4 reads
   * this list to notify ops on order-paid events). Empty array means
   * "never configured" — callers must treat that as skip-and-warn, not
   * an error.
   */
  notificationEmails: string[];
}

/** Request body for PATCH /admin/settings. Replaces the full recipient list. */
export interface UpdatePlatformSettingsRequest {
  notificationEmails: string[];
}
