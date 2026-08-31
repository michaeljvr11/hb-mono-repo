// Mirrors hb-landing's `src/app/shared/constants/site.constants.ts` (LSM-4).
// Deviation from the source: `NAV_LINKS` / `FOOTER_LINKS` are deliberately NOT
// carried across here — wiring the nav bar and footer to `/contact` is LSM-6's
// job, owned by a different agent.
export const CONTACT_DETAILS = {
  phoneDisplay: '+264 81 355 9921',
  phoneHref: 'tel:+264813559921',
  email: 'info@hb-ecommerce.com',
  emailHref: 'mailto:info@hb-ecommerce.com',
  /** No prefilled `?text=` — the footer's social icon is a generic "talk to us"
   *  entry point, not a quote request. The two prefilled variants below extend
   *  this same number; keep them in sync if it ever changes. */
  whatsappUrl: 'https://wa.me/264813559921',
  whatsappQuoteUrl: "https://wa.me/264813559921?text=Hi%20H%26B%2C%20I'd%20like%20a%20quote%20for%20importing...",
  whatsappImportRequestUrl: "https://wa.me/264813559921?text=Hi%20H%26B%2C%20I'd%20like%20to%20request%20an%20import%20quote",
} as const;

/**
 * Public social profiles, linked from the footer.
 *
 * Facebook is deliberately absent: the business has no Facebook page, and the
 * card that added these icons was itself about *removing* footer icons that
 * lead nowhere. Add a `facebook` entry here when a page exists.
 */
export const SOCIAL_LINKS = {
  whatsapp: CONTACT_DETAILS.whatsappUrl,
  instagram: 'https://www.instagram.com/hbecommerce/',
  tiktok: 'https://www.tiktok.com/@hb.ebuy',
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
