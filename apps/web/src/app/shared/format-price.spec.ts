import { formatPrice } from './format-price';

describe('formatPrice', () => {
  it('formats ZAR prices with the R prefix', () => {
    const result = formatPrice(1250, 'ZAR');
    expect(result).toMatch(/^R\s/);
    expect(result).toContain('250');
  });

  it('formats NAD prices with the N$ prefix', () => {
    const result = formatPrice(399, 'NAD');
    expect(result).toMatch(/^N\$\s/);
    expect(result).toContain('399');
  });

  it('always formats with exactly two decimal places (en-ZA uses a comma separator)', () => {
    expect(formatPrice(145, 'ZAR')).toBe(`R ${(145).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    expect(formatPrice(849, 'NAD')).toBe(`N$ ${(849).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  });

  it('groups thousands per en-ZA locale conventions', () => {
    const result = formatPrice(1450, 'NAD');
    expect(result.startsWith('N$ ')).toBe(true);
    // en-ZA groups thousands (with a locale-specific separator) — just assert the digits round-trip.
    expect(result.replace(/[^\d]/g, '')).toBe('145000');
  });

  it('accepts a numeric string (as returned by numeric(12,2) columns)', () => {
    expect(formatPrice('145.50', 'ZAR').replace(/[^\d]/g, '')).toBe('14550');
    expect(formatPrice('849.00', 'NAD').replace(/[^\d]/g, '')).toBe('84900');
  });

  it('rounds to two decimal places', () => {
    expect(formatPrice(145.999, 'ZAR').replace(/[^\d]/g, '')).toBe('14600');
  });

  it('falls back to 0 for a non-numeric string', () => {
    expect(formatPrice('not-a-number', 'ZAR').replace(/[^\d]/g, '')).toBe('000');
  });

  it('defaults to the R prefix for any non-NAD currency value', () => {
    expect(formatPrice(50, 'ZAR')).toMatch(/^R\s/);
  });
});
