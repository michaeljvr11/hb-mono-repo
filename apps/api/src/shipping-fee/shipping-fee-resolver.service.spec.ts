import { Test } from '@nestjs/testing';
import { CountryCode, CurrencyCode } from '@hb/shared';
import { ShippingFeeResolverService } from './shipping-fee-resolver.service';
import { ShippingFeeService } from './shipping-fee.service';
import { ProductShippingFeeOverrideService } from './product-shipping-fee-override.service';

/**
 * The MAX(override, default)-across-lines money logic (SF-3/SF-5) lives
 * entirely here now — both `OrdersService.create` and
 * `CurrentShippingFeeController` just call `resolveShippingCents` and trust
 * its result, so this suite is the one place that money math is verified.
 */
describe('ShippingFeeResolverService', () => {
  let service: ShippingFeeResolverService;
  let shippingFeeService: { getFeeAt: jest.Mock };
  let overrideService: { findOverrideAmounts: jest.Mock };

  const AT = new Date('2026-07-07T09:00:00.000Z');
  const DEFAULT_FEE = {
    id: 'fee-za-na-zar',
    amount: 250,
    currency: CurrencyCode.ZAR,
    originCountry: CountryCode.SOUTH_AFRICA,
    destinationCountry: CountryCode.NAMIBIA,
    effectiveFrom: AT.toISOString(),
    createdAt: AT.toISOString(),
  };

  beforeEach(async () => {
    shippingFeeService = { getFeeAt: jest.fn().mockResolvedValue({ ...DEFAULT_FEE }) };
    overrideService = { findOverrideAmounts: jest.fn().mockResolvedValue(new Map()) };

    const module = await Test.createTestingModule({
      providers: [
        ShippingFeeResolverService,
        { provide: ShippingFeeService, useValue: shippingFeeService },
        { provide: ProductShippingFeeOverrideService, useValue: overrideService },
      ],
    }).compile();

    service = module.get(ShippingFeeResolverService);
  });

  it('resolves the default fee (in cents) for a cart with no overrides', async () => {
    const cents = await service.resolveShippingCents(
      ['prod-1', 'prod-2'],
      CountryCode.SOUTH_AFRICA,
      CountryCode.NAMIBIA,
      CurrencyCode.ZAR,
      AT,
    );

    expect(cents).toBe(25000); // R250.00
    expect(overrideService.findOverrideAmounts).toHaveBeenCalledWith(
      ['prod-1', 'prod-2'],
      CountryCode.SOUTH_AFRICA,
      CountryCode.NAMIBIA,
      CurrencyCode.ZAR,
    );
    expect(shippingFeeService.getFeeAt).toHaveBeenCalledWith(
      AT,
      CountryCode.SOUTH_AFRICA,
      CountryCode.NAMIBIA,
      CurrencyCode.ZAR,
    );
  });

  it('an override HIGHER than the default wins the MAX', async () => {
    overrideService.findOverrideAmounts.mockResolvedValue(new Map([['prod-2', 400]]));

    const cents = await service.resolveShippingCents(
      ['prod-1', 'prod-2'],
      CountryCode.SOUTH_AFRICA,
      CountryCode.NAMIBIA,
      CurrencyCode.ZAR,
      AT,
    );

    expect(cents).toBe(40000); // R400.00 — this is FAIL 1's exact scenario.
  });

  it('an override LOWER than the default still loses the MAX to the default', async () => {
    overrideService.findOverrideAmounts.mockResolvedValue(new Map([['prod-2', 50]]));

    const cents = await service.resolveShippingCents(
      ['prod-1', 'prod-2'],
      CountryCode.SOUTH_AFRICA,
      CountryCode.NAMIBIA,
      CurrencyCode.ZAR,
      AT,
    );

    expect(cents).toBe(25000); // R250.00 default still wins
  });

  it('takes the max across multiple overridden lines with no un-overridden line present', async () => {
    overrideService.findOverrideAmounts.mockResolvedValue(
      new Map([
        ['prod-1', 300],
        ['prod-2', 500],
      ]),
    );

    const cents = await service.resolveShippingCents(
      ['prod-1', 'prod-2'],
      CountryCode.SOUTH_AFRICA,
      CountryCode.NAMIBIA,
      CurrencyCode.ZAR,
      AT,
    );

    expect(cents).toBe(50000);
  });

  it('resolves to the default fee, not 0, for an empty productIds list (residual zero-path closed)', async () => {
    const cents = await service.resolveShippingCents(
      [],
      CountryCode.SOUTH_AFRICA,
      CountryCode.NAMIBIA,
      CurrencyCode.ZAR,
      AT,
    );

    expect(cents).toBe(25000);
  });

  it('rounds fractional-cent amounts (no float drift)', async () => {
    shippingFeeService.getFeeAt.mockResolvedValue({ ...DEFAULT_FEE, amount: 19.995 });

    const cents = await service.resolveShippingCents(
      ['prod-1'],
      CountryCode.SOUTH_AFRICA,
      CountryCode.NAMIBIA,
      CurrencyCode.ZAR,
      AT,
    );

    expect(cents).toBe(2000); // Math.round(1999.5) = 2000
  });

  it('propagates getFeeAt throwing (never charges/previews 0 for a missing fee config)', async () => {
    shippingFeeService.getFeeAt.mockRejectedValue(
      new Error('No shipping fee covers NA->NA in NAD'),
    );

    await expect(
      service.resolveShippingCents(
        ['prod-1'],
        CountryCode.NAMIBIA,
        CountryCode.NAMIBIA,
        CurrencyCode.NAD,
        AT,
      ),
    ).rejects.toThrow('No shipping fee covers NA->NA in NAD');
  });

  it('never leaks an override from a different route or currency (bulk lookup is called with the exact route/currency)', async () => {
    await service.resolveShippingCents(
      ['prod-1'],
      CountryCode.NAMIBIA,
      CountryCode.SOUTH_AFRICA,
      CurrencyCode.NAD,
      AT,
    );

    expect(overrideService.findOverrideAmounts).toHaveBeenCalledWith(
      ['prod-1'],
      CountryCode.NAMIBIA,
      CountryCode.SOUTH_AFRICA,
      CurrencyCode.NAD,
    );
  });
});
