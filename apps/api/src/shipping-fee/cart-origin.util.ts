import { BadRequestException } from '@nestjs/common';
import { CountryCode } from '@hb/shared';

/**
 * Resolves the single order-level origin country from the distinct set of
 * `product.originCountry` values across a cart's lines.
 *
 * This is the EXACT rule `OrdersService.create` uses to pick the route a
 * new order is placed on: a single-origin cart resolves to that origin; a
 * cart whose lines span more than one origin country falls back to South
 * Africa (HB's primary origin) rather than guessing which line "wins".
 * Extracted here (not duplicated) so SF-4's checkout shipping-fee preview
 * can derive the same origin `OrdersService.create` will actually charge —
 * the two call sites can never drift apart.
 *
 * An empty input (no cart lines / no cart) is not a valid cart to resolve a
 * route for — throws a 400 rather than guessing an origin.
 */
export function resolveCartOriginCountry(originCountries: Iterable<CountryCode>): CountryCode {
  const distinct = new Set(originCountries);
  if (distinct.size === 0) {
    throw new BadRequestException('Your cart is empty');
  }
  return distinct.size === 1 ? [...distinct][0] : CountryCode.SOUTH_AFRICA;
}
