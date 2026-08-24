import { IsEnum } from 'class-validator';
import { CountryCode, CurrencyCode, GetCurrentShippingFeeQuery } from '@hb/shared';

/** Query params for GET /shipping-fee/current — see the shared interface's doc comment. */
export class GetCurrentShippingFeeQueryDto implements GetCurrentShippingFeeQuery {
  @IsEnum(CountryCode, { message: 'originCountry must be ZA or NA' })
  originCountry: CountryCode;

  @IsEnum(CountryCode, { message: 'destinationCountry must be ZA or NA' })
  destinationCountry: CountryCode;

  @IsEnum(CurrencyCode, { message: 'currency must be ZAR or NAD' })
  currency: CurrencyCode;
}
