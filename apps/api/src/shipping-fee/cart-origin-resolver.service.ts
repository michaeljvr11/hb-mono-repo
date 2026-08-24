import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryCode } from '@hb/shared';

import { Cart } from '../cart/entities/cart.entity';
import { resolveCartOriginCountry } from './cart-origin.util';

/**
 * Resolves the order-level origin country from a user's CURRENT cart, for
 * callers that don't yet have an order to read a route off of — SF-4's
 * checkout shipping-fee preview (`GET /shipping-fee/current` when
 * `originCountry` is omitted). Applies `resolveCartOriginCountry` — the
 * exact rule `OrdersService.create` uses — over the live
 * `product.originCountry` of every cart line, so the previewed route can
 * never drift from the one an actual checkout would charge.
 */
@Injectable()
export class CartOriginResolverService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
  ) {}

  async resolveForUser(userId: string): Promise<CountryCode> {
    const cart = await this.cartRepository.findOne({
      where: { userId },
      relations: ['items', 'items.product'],
    });

    const originCountries = (cart?.items ?? [])
      .filter((item) => !!item.product)
      .map((item) => item.product.originCountry);

    return resolveCartOriginCountry(originCountries);
  }
}
