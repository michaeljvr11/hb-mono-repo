import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CountryCode,
  CreateShippingFeeSetEntry,
  CreateShippingFeeSetRequest,
  CurrencyCode,
} from '@hb/shared';

/** One (route, currency) entry of a POST /admin/shipping-fees submission. */
export class CreateShippingFeeSetEntryDto implements CreateShippingFeeSetEntry {
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

/**
 * Request body for POST /admin/shipping-fees. `fees` must cover every
 * (route, currency) combination — 4 routes x 2 currencies = 8 entries — the
 * service rejects an incomplete or duplicated set with 400.
 */
export class CreateShippingFeeSetDto implements CreateShippingFeeSetRequest {
  @IsArray()
  @ArrayMinSize(8)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => CreateShippingFeeSetEntryDto)
  fees: CreateShippingFeeSetEntryDto[];

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
