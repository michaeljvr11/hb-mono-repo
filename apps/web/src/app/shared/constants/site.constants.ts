// Mirrors hb-landing's `src/app/shared/constants/site.constants.ts` (LSM-4).
// Deviation from the source: `NAV_LINKS` / `FOOTER_LINKS` are deliberately NOT
// carried across here — wiring the nav bar and footer to `/contact` is LSM-6's
// job, owned by a different agent.
export const CONTACT_DETAILS = {
  phoneDisplay: '+264 81 355 9921',
  phoneHref: 'tel:+264813559921',
  email: 'info@hb-ecommerce.com',
  emailHref: 'mailto:info@hb-ecommerce.com',
  whatsappQuoteUrl: "https://wa.me/264813559921?text=Hi%20H%26B%2C%20I'd%20like%20a%20quote%20for%20importing...",
  whatsappImportRequestUrl: "https://wa.me/264813559921?text=Hi%20H%26B%2C%20I'd%20like%20to%20request%20an%20import%20quote",
} as const;

/**
 * Registered legal entity facts — confirmed by the business owner 2026-08-27,
 * resolving Trello card LC-1's blocking Open Questions 1/2/8 for the legal
 * pages. Bind these rather than hardcoding the strings, so the Privacy Policy
 * and Terms of Service can never drift apart on entity identity. The
 * Information Officer name/email remain unresolved — see the legal pages'
 * `[INFORMATION OFFICER NAME]` / `[INFORMATION OFFICER EMAIL]` placeholders.
 */
export const ENTITY_DETAILS = {
  legalName: 'Hammond and Brewer Trading Enterprises CC',
  registrationNumber: 'CC/2022/10761',
  registeredAddress: 'ERF 109, Block D, Rehoboth, Namibia',
  /** Namibia-only incorporation, confirmed — resolves Open Question 1 for a
   *  single entity (not a dual SA/NA structure). */
  governingLawJurisdiction: 'the Republic of Namibia',
} as const;
