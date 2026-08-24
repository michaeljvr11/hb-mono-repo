import { Test } from '@nestjs/testing';
import { CountryCode, CurrencyCode } from '@hb/shared';
import { CurrentShippingFeeController } from './current-shipping-fee.controller';
import { ShippingFeeService } from './shipping-fee.service';
import { CartOriginResolverService } from './cart-origin-resolver.service';
import { User } from '../users/entities/user.entity';

describe('CurrentShippingFeeController', () => {
  let controller: CurrentShippingFeeController;
  let service: { getFeeAt: jest.Mock };
  let cartOriginResolver: { resolveForUser: jest.Mock };
  const user = { id: 'user-1' } as User;

  beforeEach(async () => {
    service = {
      getFeeAt: jest.fn().mockResolvedValue({
        id: 'fee-1',
        amount: 250,
        currency: CurrencyCode.ZAR,
        originCountry: CountryCode.SOUTH_AFRICA,
        destinationCountry: CountryCode.NAMIBIA,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    };
    cartOriginResolver = {
      resolveForUser: jest.fn().mockResolvedValue(CountryCode.SOUTH_AFRICA),
    };

    const module = await Test.createTestingModule({
      controllers: [CurrentShippingFeeController],
      providers: [
        { provide: ShippingFeeService, useValue: service },
        { provide: CartOriginResolverService, useValue: cartOriginResolver },
      ],
    }).compile();

    controller = module.get(CurrentShippingFeeController);
  });

  it('resolves the fee for the requested route + currency, live (new Date()), and never mixes routes/currencies', async () => {
    const result = await controller.current(
      {
        originCountry: CountryCode.SOUTH_AFRICA,
        destinationCountry: CountryCode.NAMIBIA,
        currency: CurrencyCode.ZAR,
      },
      user,
    );

    expect(service.getFeeAt).toHaveBeenCalledWith(
      expect.any(Date),
      CountryCode.SOUTH_AFRICA,
      CountryCode.NAMIBIA,
      CurrencyCode.ZAR,
    );
    expect(result).toEqual({
      amount: 250,
      currency: CurrencyCode.ZAR,
      originCountry: CountryCode.SOUTH_AFRICA,
      destinationCountry: CountryCode.NAMIBIA,
    });
  });

  it('propagates getFeeAt failing (no config for this route/currency) rather than guessing a fee', async () => {
    service.getFeeAt.mockRejectedValue(new Error('No shipping fee covers NA->NA in NAD'));

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

  it('honours an explicitly-supplied originCountry without consulting the cart', async () => {
    await controller.current(
      {
        originCountry: CountryCode.NAMIBIA,
        destinationCountry: CountryCode.SOUTH_AFRICA,
        currency: CurrencyCode.NAD,
      },
      user,
    );

    expect(cartOriginResolver.resolveForUser).not.toHaveBeenCalled();
    expect(service.getFeeAt).toHaveBeenCalledWith(
      expect.any(Date),
      CountryCode.NAMIBIA,
      CountryCode.SOUTH_AFRICA,
      CurrencyCode.NAD,
    );
  });

  it("derives originCountry from the caller's cart when omitted", async () => {
    cartOriginResolver.resolveForUser.mockResolvedValue(CountryCode.NAMIBIA);

    const result = await controller.current(
      {
        destinationCountry: CountryCode.SOUTH_AFRICA,
        currency: CurrencyCode.ZAR,
      },
      user,
    );

    expect(cartOriginResolver.resolveForUser).toHaveBeenCalledWith('user-1');
    expect(service.getFeeAt).toHaveBeenCalledWith(
      expect.any(Date),
      CountryCode.NAMIBIA,
      CountryCode.SOUTH_AFRICA,
      CurrencyCode.ZAR,
    );
    expect(result.originCountry).toBe(CountryCode.SOUTH_AFRICA); // echoes the resolved fee row, not the request
  });

  it("propagates the cart-origin resolver's 400 (empty cart) instead of guessing", async () => {
    const { BadRequestException } = await import('@nestjs/common');
    cartOriginResolver.resolveForUser.mockRejectedValue(
      new BadRequestException('Your cart is empty'),
    );

    await expect(
      controller.current(
        { destinationCountry: CountryCode.NAMIBIA, currency: CurrencyCode.ZAR },
        user,
      ),
    ).rejects.toThrow('Your cart is empty');
  });
});
