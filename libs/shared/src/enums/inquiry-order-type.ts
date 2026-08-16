/**
 * What a contact inquiry is asking for. A closed set rather than free text so
 * the endpoint can validate it and platform ops can triage without parsing
 * prose. Values are hb-landing's three form options carried across verbatim
 * (see [[Landing Site Migration]] — LSM-4/LSM-5).
 */
export const InquiryOrderType = {
  /** Repeat / business bulk sourcing — the standing Procurement Service. */
  RECURRING: 'recurring_order',
  /** A single sourcing request for something not listed on the marketplace. */
  ONE_TIME: 'one_time_order',
  /** Anything else — the message body carries the detail. */
  OTHER: 'other',
} as const;
export type InquiryOrderType = (typeof InquiryOrderType)[keyof typeof InquiryOrderType];
