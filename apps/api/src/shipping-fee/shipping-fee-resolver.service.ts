import { Injectable } from '@nestjs/common';
import { CountryCode, CurrencyCode } from '@hb/shared';

import { ShippingFeeService } from './shipping-fee.service';
import { ProductShippingFeeOverrideService } from './product-shipping-fee-override.service';

/**
 * Single source of truth for "what shipping fee (in integer cents) applies
 * to this cart on this route/currency at this instant" — the exact
 * override-or-default, MAX-across-lines rule from SF-3/SF-5. Each product
 * resolves to its (route, currency) override if one is set (SF-5), else the
 * global default (SF-1, `ShippingFeeService.getFeeAt`); the fee charged for
 * the whole cart is the MAX across every line's resolved fee, never a sum.
 *
 * Used by both `OrdersService.create` (the actual charge) and
 * `CurrentShippingFeeController` (the checkout preview) so the two can never
 * resolve different fees for the same cart — the bug this service was
 * extracted to close (checkout previewed the global default only, while the
 * order charged MAX(override, default), see FAIL 1 in code review).
 *
 * `getFeeAt` throws rather than returning 0 when no default fee covers the
 * route/currency; that throw is never swallowed here, so a missing fee
 * config fails the caller (order creation or preview) instead of silently
 * resolving 0.
 */
@Injectable()
export class ShippingFeeResolverService {
  constructor(
    private readonly shippingFeeService: ShippingFeeService,
    private readonly productShippingFeeOverrideService: ProductShippingFeeOverrideService,
  ) {}

  async resolveShippingCents(
    productIds: string[],
    originCountry: CountryCode,
    destinationCountry: CountryCode,
    currency: CurrencyCode,
    at: Date,
  ): Promise<number> {
    const overrideAmounts = await this.productShippingFeeOverrideService.findOverrideAmounts(
      productIds,
      originCountry,
      destinationCountry,
      currency,
    );
    const defaultFee = await this.shippingFeeService.getFeeAt(
      at,
      originCountry,
      destinationCountry,
      currency,
    );
    const defaultFeeCents = Math.round(defaultFee.amount * 100);

    // Seeded from the resolved default (not 0): even a productIds list that
    // somehow reached here empty still resolves to the real default fee
    // rather than a phantom free-shipping fallback.
    let shippingCents = defaultFeeCents;
    for (const productId of productIds) {
      const overrideAmount = overrideAmounts.get(productId);
      const lineFeeCents =
        overrideAmount !== undefined ? Math.round(overrideAmount * 100) : defaultFeeCents;
      if (lineFeeCents > shippingCents) shippingCents = lineFeeCents;
    }

    return shippingCents;
  }
}
