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
