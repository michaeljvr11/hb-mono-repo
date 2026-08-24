import { IsEnum } from 'class-validator';
import { CountryCode, CurrencyCode, ProductShippingFeeOverrideRoute } from '@hb/shared';

/**
 * Query params for DELETE /admin/products/:productId/shipping-fee-overrides
 * — identifies the exact (route, currency) combination to clear. Query
 * params rather than a body: DELETE request bodies are inconsistently
 * supported by proxies/clients.
 */
export class ClearProductShippingFeeOverrideDto implements ProductShippingFeeOverrideRoute {
  @IsEnum(CountryCode, { message: 'originCountry must be ZA or NA' })
  originCountry: CountryCode;

  @IsEnum(CountryCode, { message: 'destinationCountry must be ZA or NA' })
  destinationCountry: CountryCode;

  @IsEnum(CurrencyCode, { message: 'currency must be ZAR or NAD' })
  currency: CurrencyCode;
}
