import { InquiryOrderType } from '../enums';

/**
 * A contact-form submission from `/contact` — the "source me something not
 * listed on the site" channel (see [[Landing Site Migration]]). Shape carried
 * across from hb-landing's `ContactInquiry`, with `orderType` narrowed from a
 * free string to a closed enum.
 *
 * This is a lead, not an order: no money, no inventory, no order state. It is
 * persisted so nothing is lost when email delivery fails, and notified to
 * platform ops via the existing MailService.
 */
export interface CreateContactInquiryRequest {
  name: string;
  email: string;
  /** Optional — hb-landing's form never required a contact number. */
  phone?: string;
  orderType: InquiryOrderType;
  /** Optional — only supplied when the customer ticks "I have a reference number". */
  referenceNumber?: string;
  message: string;
}

/**
 * Acknowledgement returned to the browser. Deliberately thin: the form only
 * needs to know the inquiry landed, and echoing the submitted payload back to
 * an unauthenticated caller buys nothing. `receivedAt` is an ISO-8601 string,
 * matching every other date on the wire in this codebase.
 */
export interface ContactInquiryDto {
  id: string;
  receivedAt: string;
}
