import { Test } from '@nestjs/testing';
import { CountryCode, CurrencyCode } from '@hb/shared';
import { CurrentShippingFeeController } from './current-shipping-fee.controller';
import { ShippingFeeService } from './shipping-fee.service';

describe('CurrentShippingFeeController', () => {
  let controller: CurrentShippingFeeController;
  let service: { getFeeAt: jest.Mock };

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

    const module = await Test.createTestingModule({
      controllers: [CurrentShippingFeeController],
      providers: [{ provide: ShippingFeeService, useValue: service }],
    }).compile();

    controller = module.get(CurrentShippingFeeController);
  });

  it('resolves the fee for the requested route + currency, live (new Date()), and never mixes routes/currencies', async () => {
    const result = await controller.current({
      originCountry: CountryCode.SOUTH_AFRICA,
      destinationCountry: CountryCode.NAMIBIA,
      currency: CurrencyCode.ZAR,
    });

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
      controller.current({
        originCountry: CountryCode.NAMIBIA,
        destinationCountry: CountryCode.NAMIBIA,
        currency: CurrencyCode.NAD,
      }),
    ).rejects.toThrow('No shipping fee covers NA->NA in NAD');
  });
});
