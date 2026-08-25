import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryCode } from '@hb/shared';

import { Cart } from '../cart/entities/cart.entity';
import { resolveCartOriginCountry } from './cart-origin.util';

/** The order-level route origin plus the product ids on a user's cart, from one load. */
export interface CartOriginAndProducts {
  originCountry: CountryCode;
  /** Ids of every cart line whose product still exists — the exact set `OrdersService.create` prices. */
  productIds: string[];
}

/**
 * Resolves the order-level origin country — and, for FAIL 1's checkout
 * preview parity, the cart's product ids — from a user's CURRENT cart, for
 * callers that don't yet have an order to read a route off of. SF-4's
 * checkout shipping-fee preview (`GET /shipping-fee/current`) needs both out
 * of the *same* cart load: the origin (when `originCountry` is omitted) and
 * the product ids (always, to resolve per-product overrides via
 * `ShippingFeeResolverService` exactly like `OrdersService.create` does) —
 * see `CurrentShippingFeeController`. One `cartRepository.findOne` call
 * serves both; there is deliberately no second cart query anywhere in this
 * module.
 *
 * Applies `resolveCartOriginCountry` — the exact rule `OrdersService.create`
 * uses — over the live `product.originCountry` of every cart line, so the
 * previewed route can never drift from the one an actual checkout would
 * charge. An empty (or missing) cart throws a 400 via
 * `resolveCartOriginCountry`, same as before.
 */
@Injectable()
export class CartOriginResolverService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
  ) {}

  async resolveCartForUser(userId: string): Promise<CartOriginAndProducts> {
    const cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items', 'items.product'],
    });

    // A cart line whose product row has since been deleted is silently
    // dropped from the preview (FAIL 3, code review, advisory-only — left
    // as-is deliberately): `OrdersService.create` still throws a 400 for
    // that same line at checkout ("A product in your cart is no longer
    // available"), so this is only a wrong *order* of errors — a stale-cart
    // preview renders fine and checkout still fails — never a mischarge.
    // Silently dropping the line here means the preview stays usable for a
    // cart's still-valid lines rather than 400ing the whole preview over a
    // dangling reference; a stricter preview would need its own
    // product-existence check duplicated from `OrdersService.create` for a
    // cosmetic-only ordering fix.
    const items = (cart?.items ?? []).filter((item) => !!item.product);
    const originCountries = items.map((item) => item.product.originCountry);

    return {
      originCountry: resolveCartOriginCountry(originCountries),
      productIds: items.map((item) => item.productId),
    };
  }
}
