import { Controller, Get, Query } from '@nestjs/common';
import { CurrentShippingFeeDto } from '@hb/shared';
import { ShippingFeeResolverService } from './shipping-fee-resolver.service';
import { CartOriginResolverService } from './cart-origin-resolver.service';
import { GetCurrentShippingFeeQueryDto } from './dto/get-current-shipping-fee-query.dto';
import { GetUser } from '../common/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

/**
 * GET /shipping-fee/current — checkout preview (SF-3). Distinct from
 * SF-1's `admin/shipping-fees` controller (admin-only): this route is for
 * any signed-in shopper to see the fee before an order exists, so it carries
 * no `@Roles()`/admin restriction. It is NOT `@Public()` either — checkout is
 * behind auth today (see `OrdersService.create`'s `isVerified` gate), so this
 * preview matches that posture: the global `JwtAuthGuard` applies as-is, and
 * this controller is registered (with no public routes) in
 * `common/guards/public-routes.guardrail.spec.ts`.
 *
 * Resolves the SAME MAX(override, default) fee `OrdersService.create` would
 * charge for the caller's cart (FAIL 1 fix, code review) via the shared
 * `ShippingFeeResolverService.resolveShippingCents` — a per-product override
 * (SF-5) is no longer ignored here, so a cart containing an overridden
 * product previews the fee that will actually be charged, not just the
 * global default.
 *
 * `originCountry` is optional (SF-4): the checkout UI has no order to read a
 * route off of, and re-deriving `OrdersService.create`'s origin rule in
 * Angular would drift from the fee actually charged. So when the caller
 * omits it, it's derived from the caller's own cart via
 * `CartOriginResolverService`. That same cart load also yields the cart's
 * product ids — needed for the override lookup regardless of whether
 * `originCountry` was supplied — so there is only ever one cart query per
 * request. An explicitly-supplied `originCountry` is still honoured
 * verbatim (it overrides only the route resolution, not which products the
 * override lookup runs against).
 */
@Controller('shipping-fee')
export class CurrentShippingFeeController {
  constructor(
    private readonly shippingFeeResolver: ShippingFeeResolverService,
    private readonly cartOriginResolver: CartOriginResolverService,
  ) {}

  @Get('current')
  async current(
    @Query() query: GetCurrentShippingFeeQueryDto,
    @GetUser() user: User,
  ): Promise<CurrentShippingFeeDto> {
    const cart = await this.cartOriginResolver.resolveCartForUser(user.id);
    const originCountry = query.originCountry ?? cart.originCountry;

    const amountCents = await this.shippingFeeResolver.resolveShippingCents(
      cart.productIds,
      originCountry,
      query.destinationCountry,
      query.currency,
      new Date(),
    );

    return {
      amount: amountCents / 100,
      currency: query.currency,
      originCountry,
      destinationCountry: query.destinationCountry,
    };
  }
}
