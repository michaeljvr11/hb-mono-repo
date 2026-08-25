import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CountryCode, CurrencyCode } from '@hb/shared';
import { CurrentShippingFeeController } from './current-shipping-fee.controller';
import { ShippingFeeResolverService } from './shipping-fee-resolver.service';
import { CartOriginResolverService } from './cart-origin-resolver.service';
import { User } from '../users/entities/user.entity';

describe('CurrentShippingFeeController', () => {
  let controller: CurrentShippingFeeController;
  let shippingFeeResolver: { resolveShippingCents: jest.Mock };
  let cartOriginResolver: { resolveCartForUser: jest.Mock };
  const user = { id: 'user-1' } as User;

  beforeEach(async () => {
    shippingFeeResolver = {
      resolveShippingCents: jest.fn().mockResolvedValue(25000), // R250.00 default
    };
    cartOriginResolver = {
      resolveCartForUser: jest.fn().mockResolvedValue({
        originCountry: CountryCode.SOUTH_AFRICA,
        productIds: ['prod-1'],
      }),
    };

    const module = await Test.createTestingModule({
      controllers: [CurrentShippingFeeController],
      providers: [
        { provide: ShippingFeeResolverService, useValue: shippingFeeResolver },
        { provide: CartOriginResolverService, useValue: cartOriginResolver },
      ],
    }).compile();

    controller = module.get(CurrentShippingFeeController);
  });

  it('resolves the fee for the requested route + currency, live (new Date()), over the cart products', async () => {
    const result = await controller.current(
      {
        originCountry: CountryCode.SOUTH_AFRICA,
        destinationCountry: CountryCode.NAMIBIA,
        currency: CurrencyCode.ZAR,
      },
      user,
    );

    expect(shippingFeeResolver.resolveShippingCents).toHaveBeenCalledWith(
      ['prod-1'],
      CountryCode.SOUTH_AFRICA,
      CountryCode.NAMIBIA,
      CurrencyCode.ZAR,
      expect.any(Date),
    );
    expect(result).toEqual({
      amount: 250,
      currency: CurrencyCode.ZAR,
      originCountry: CountryCode.SOUTH_AFRICA,
      destinationCountry: CountryCode.NAMIBIA,
    });
  });

  it('propagates fee resolution failing (no config for this route/currency) rather than guessing a fee', async () => {
    shippingFeeResolver.resolveShippingCents.mockRejectedValue(
      new Error('No shipping fee covers NA->NA in NAD'),
    );

    await expect(
      controller.current(
        {
          originCountry: CountryCode.NAMIBIA,
          destinationCountry: CountryCode.NAMIBIA,
          currency: CurrencyCode.NAD,
        },
        user,
      ),
    ).rejects.toThrow('No shipping fee covers NA->NA in NAD');
  });

  it('honours an explicitly-supplied originCountry, but still resolves the cart for productIds', async () => {
    await controller.current(
      {
        originCountry: CountryCode.NAMIBIA,
        destinationCountry: CountryCode.SOUTH_AFRICA,
        currency: CurrencyCode.NAD,
      },
      user,
    );

    // productIds are needed for the override lookup regardless of whether
    // originCountry was supplied explicitly — one cart load always happens.
    expect(cartOriginResolver.resolveCartForUser).toHaveBeenCalledWith('user-1');
    expect(shippingFeeResolver.resolveShippingCents).toHaveBeenCalledWith(
      ['prod-1'],
      CountryCode.NAMIBIA, // the explicit value, not the cart-derived origin
      CountryCode.SOUTH_AFRICA,
      CurrencyCode.NAD,
      expect.any(Date),
    );
  });

  it("derives originCountry from the caller's cart when omitted", async () => {
    cartOriginResolver.resolveCartForUser.mockResolvedValue({
      originCountry: CountryCode.NAMIBIA,
      productIds: ['prod-1'],
    });

    const result = await controller.current(
      {
        destinationCountry: CountryCode.SOUTH_AFRICA,
        currency: CurrencyCode.ZAR,
      },
      user,
    );

    expect(cartOriginResolver.resolveCartForUser).toHaveBeenCalledWith('user-1');
    expect(shippingFeeResolver.resolveShippingCents).toHaveBeenCalledWith(
      ['prod-1'],
      CountryCode.NAMIBIA,
      CountryCode.SOUTH_AFRICA,
      CurrencyCode.ZAR,
      expect.any(Date),
    );
    expect(result.originCountry).toBe(CountryCode.NAMIBIA);
  });

  it("propagates the cart resolver's 400 (empty cart) instead of guessing", async () => {
    cartOriginResolver.resolveCartForUser.mockRejectedValue(
      new BadRequestException('Your cart is empty'),
    );

    await expect(
      controller.current(
        { destinationCountry: CountryCode.NAMIBIA, currency: CurrencyCode.ZAR },
        user,
      ),
    ).rejects.toThrow('Your cart is empty');
  });

  // ── FAIL 1: preview honours a per-product override, not just the default ──

  it('returns the MAX(override, default) when the cart has an override HIGHER than the default', async () => {
    cartOriginResolver.resolveCartForUser.mockResolvedValue({
      originCountry: CountryCode.SOUTH_AFRICA,
      productIds: ['prod-1', 'prod-overridden'],
    });
    shippingFeeResolver.resolveShippingCents.mockResolvedValue(40000); // R400.00

    const result = await controller.current(
      { destinationCountry: CountryCode.NAMIBIA, currency: CurrencyCode.ZAR },
      user,
    );

    expect(shippingFeeResolver.resolveShippingCents).toHaveBeenCalledWith(
      ['prod-1', 'prod-overridden'],
      CountryCode.SOUTH_AFRICA,
      CountryCode.NAMIBIA,
      CurrencyCode.ZAR,
      expect.any(Date),
    );
    expect(result.amount).toBe(400);
  });

  it('returns the default when the only override in the cart is LOWER than the default', async () => {
    shippingFeeResolver.resolveShippingCents.mockResolvedValue(25000); // resolver already applied the MAX

    const result = await controller.current(
      { destinationCountry: CountryCode.NAMIBIA, currency: CurrencyCode.ZAR },
      user,
    );

    expect(result.amount).toBe(250);
  });
});
