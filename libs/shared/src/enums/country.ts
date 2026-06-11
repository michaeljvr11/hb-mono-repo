/**
 * Countries the platform operates in. ISO 3166-1 alpha-2.
 * ZA and NA share a customs union (SACU) and a 1:1 currency peg (ZAR/NAD),
 * but every record that touches money or fulfilment is still tagged with
 * an explicit country and currency so the peg is never a hidden assumption.
 */
export const CountryCode = {
  SOUTH_AFRICA: 'ZA',
  NAMIBIA: 'NA',
} as const;
export type CountryCode = (typeof CountryCode)[keyof typeof CountryCode];

/** ISO 4217. NAD is pegged 1:1 to ZAR but stored as its own currency. */
export const CurrencyCode = {
  ZAR: 'ZAR',
  NAD: 'NAD',
} as const;
export type CurrencyCode = (typeof CurrencyCode)[keyof typeof CurrencyCode];

/** Home currency per operating country. */
export const COUNTRY_CURRENCY: Record<CountryCode, CurrencyCode> = {
  ZA: CurrencyCode.ZAR,
  NA: CurrencyCode.NAD,
};
