import {
  IsDateString,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  registerDecorator,
  ValidateIf,
  ValidationOptions,
} from 'class-validator';
import { AnalyticsEventType, CreateAnalyticsEventRequest, CurrencyCode } from '@hb/shared';

/** metadata lands in a jsonb column via a @Public endpoint — cap the
 *  serialized size so anonymous callers can't spam multi-kilobyte blobs. */
const METADATA_MAX_BYTES = 2048;

function MaxJsonBytes(maxBytes: number, validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'maxJsonBytes',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => JSON.stringify(value).length <= maxBytes,
      },
    });
  };
}

/**
 * Ingestion payload for POST /analytics/events. No PII fields exist here —
 * `sessionId` is a client-minted anonymous UUID, and `metadata` is validated
 * only for shape (callers are responsible for keeping it PII-free).
 */
export class CreateAnalyticsEventDto implements CreateAnalyticsEventRequest {
  @IsIn(Object.values(AnalyticsEventType), { message: 'Unknown analytics event type' })
  type: AnalyticsEventType;

  @IsString()
  @IsNotEmpty({ message: 'sessionId is required' })
  @MaxLength(64, { message: 'sessionId is too long' })
  sessionId: string;

  @IsOptional()
  @IsUUID('all', { message: 'productId must be a valid id' })
  productId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'vendorId must be a valid id' })
  vendorId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'orderId must be a valid id' })
  orderId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'value must be numeric(12,2)' })
  @Min(0, { message: 'value cannot be negative' })
  value?: number;

  /**
   * Required whenever `value` is present (a monetary amount without a
   * currency is meaningless). Still validated for shape whenever supplied,
   * even on non-monetary events.
   */
  @ValidateIf(
    (dto: CreateAnalyticsEventDto) => dto.value !== undefined || dto.currency !== undefined,
  )
  @IsDefined({ message: 'currency is required when value is present' })
  @IsIn(Object.values(CurrencyCode), { message: 'Unknown currency' })
  currency?: CurrencyCode;

  @IsOptional()
  @IsObject({ message: 'metadata must be an object' })
  @MaxJsonBytes(METADATA_MAX_BYTES, { message: 'metadata is too large' })
  metadata?: Record<string, unknown>;

  @IsDateString({}, { message: 'occurredAt must be an ISO timestamp' })
  occurredAt: string;
}
