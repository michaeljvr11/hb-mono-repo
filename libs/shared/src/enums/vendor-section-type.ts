// Deliberately left open for a future 'rule' member (auto-fills from a filter rule
// rather than a hand-picked list or a single category) — do not treat this as closed.
export const VendorSectionType = {
  CURATED: 'curated',
  CATEGORY: 'category',
} as const;
export type VendorSectionType = (typeof VendorSectionType)[keyof typeof VendorSectionType];
