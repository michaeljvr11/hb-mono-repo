import { IsEnum, IsNumber, Min } from 'class-validator';
import { CountryCode, CurrencyCode, SetProductShippingFeeOverrideRequest } from '@hb/shared';

/** Body for PUT /admin/products/:productId/shipping-fee-overrides — upsert semantics. */
export class SetProductShippingFeeOverrideDto implements SetProductShippingFeeOverrideRequest {
  @IsEnum(CountryCode, { message: 'originCountry must be ZA or NA' })
  originCountry: CountryCode;

  @IsEnum(CountryCode, { message: 'destinationCountry must be ZA or NA' })
  destinationCountry: CountryCode;

  @IsEnum(CurrencyCode, { message: 'currency must be ZAR or NAD' })
  currency: CurrencyCode;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;
}
