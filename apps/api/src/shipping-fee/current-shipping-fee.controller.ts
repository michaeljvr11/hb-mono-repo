import { Controller, Get, Query } from '@nestjs/common';
import { CurrentShippingFeeDto } from '@hb/shared';
import { ShippingFeeService } from './shipping-fee.service';
import { GetCurrentShippingFeeQueryDto } from './dto/get-current-shipping-fee-query.dto';

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
 * Reflects only the global default (`ShippingFeeService.getFeeAt`) — a
 * per-product override (SF-5) is cart-line-specific and only resolved at
 * order-creation time, never guessed here.
 */
@Controller('shipping-fee')
export class CurrentShippingFeeController {
  constructor(private readonly shippingFeeService: ShippingFeeService) {}

  @Get('current')
  async current(@Query() query: GetCurrentShippingFeeQueryDto): Promise<CurrentShippingFeeDto> {
    const fee = await this.shippingFeeService.getFeeAt(
      new Date(),
      query.originCountry,
      query.destinationCountry,
      query.currency,
    );
    return {
      amount: fee.amount,
      currency: fee.currency,
      originCountry: fee.originCountry,
      destinationCountry: fee.destinationCountry,
    };
  }
}
