import { VendorStatus } from '@hb/shared';

export interface VendorAction {
  label: string;
  target: Exclude<VendorStatus, 'pending'>;
}

/**
 * Returns the set of valid status transitions for a vendor at the given status.
 * The lifecycle rules are:
 *   pending   → approve (→approved) | reject (→rejected)
 *   approved  → suspend (→suspended)
 *   suspended → re-approve (→approved)
 *   rejected  → no actions
 *
 * The returned `target` values never include 'pending'.
 */
export function vendorActionsFor(status: VendorStatus): VendorAction[] {
  switch (status) {
    case VendorStatus.PENDING:
      return [
        { label: 'Approve', target: VendorStatus.APPROVED },
        { label: 'Reject',  target: VendorStatus.REJECTED },
      ];
    case VendorStatus.APPROVED:
      return [
        { label: 'Suspend', target: VendorStatus.SUSPENDED },
      ];
    case VendorStatus.SUSPENDED:
      return [
        { label: 'Re-approve', target: VendorStatus.APPROVED },
      ];
    case VendorStatus.REJECTED:
      return [];
    default:
      return [];
  }
}
