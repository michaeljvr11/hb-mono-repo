import { CurrencyCode } from '@hb/shared';

/**
 * Centralizes the storefront's price display semantics (see `Shop.formatPrice`,
 * which this replaces): en-ZA locale, 2 decimal places, "R " for ZAR and
 * "N$ " for NAD. Accepts either a numeric price or a numeric string (API
 * responses may serialize `numeric(12,2)` columns as strings).
 */
export function formatPrice(price: string | number, currency: string): string {
  const numeric = typeof price === 'string' ? Number(price) : price;

  const formatted = new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);

  return currency === CurrencyCode.NAD ? `N$ ${formatted}` : `R ${formatted}`;
}
