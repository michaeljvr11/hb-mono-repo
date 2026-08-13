import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Rejects a date string strictly later than today, evaluated in UTC (the
 * whole earnings stack — `resolveEarningsWindow`, `resolveAnalyticsRange` —
 * is UTC-pinned). A `to` equal to today's UTC date is VALID; only a date
 * strictly after today fails. Card EDR-1 (vault: "Earnings Date-Range
 * Filtering", resolved 2026-08-11) applies this to `to` on both
 * `AdminEarningsQueryDto` and `VendorEarningsQueryDto` — written once here so
 * the rule can't drift between the two.
 *
 * Composes with `@IsOptional()`: `undefined`/`null` pass through untouched.
 * Composes with `@IsDateString()`: a malformed string is not this
 * decorator's problem — it only rejects strings that parse to a valid,
 * future date, and lets anything that fails to parse fall through as valid
 * here so `@IsDateString()` alone owns that failure mode.
 */
export function IsNotFutureDate(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isNotFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'string') return true;

          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime())) return true;

          const todayUtc = new Date();
          const todayUtcDateOnly = Date.UTC(
            todayUtc.getUTCFullYear(),
            todayUtc.getUTCMonth(),
            todayUtc.getUTCDate(),
          );
          const valueUtcDateOnly = Date.UTC(
            parsed.getUTCFullYear(),
            parsed.getUTCMonth(),
            parsed.getUTCDate(),
          );

          return valueUtcDateOnly <= todayUtcDateOnly;
        },
        defaultMessage(args: ValidationArguments): string {
          // Named off the property rather than hardcoding `to` — this decorator
          // is generic, and the message must not lie the first time someone
          // applies it to `from`, `effectiveFrom`, or anything else.
          return `\`${args.property}\` cannot be a future date`;
        },
      },
    });
  };
}
