export const VendorStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
} as const;
export type VendorStatus = (typeof VendorStatus)[keyof typeof VendorStatus];
