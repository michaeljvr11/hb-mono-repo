import { BadRequestException } from '@nestjs/common';
import { CountryCode } from '@hb/shared';
import { resolveCartOriginCountry } from './cart-origin.util';

describe('resolveCartOriginCountry', () => {
  it('resolves to the single distinct origin country in a single-origin cart', () => {
    expect(resolveCartOriginCountry([CountryCode.NAMIBIA, CountryCode.NAMIBIA])).toBe(
      CountryCode.NAMIBIA,
    );
    expect(resolveCartOriginCountry([CountryCode.SOUTH_AFRICA])).toBe(CountryCode.SOUTH_AFRICA);
  });

  it('falls back to South Africa when the cart spans more than one origin', () => {
    expect(resolveCartOriginCountry([CountryCode.SOUTH_AFRICA, CountryCode.NAMIBIA])).toBe(
      CountryCode.SOUTH_AFRICA,
    );
  });

  it('throws a 400 for an empty cart rather than guessing an origin', () => {
    expect(() => resolveCartOriginCountry([])).toThrow(BadRequestException);
    expect(() => resolveCartOriginCountry([])).toThrow('Your cart is empty');
  });
});
