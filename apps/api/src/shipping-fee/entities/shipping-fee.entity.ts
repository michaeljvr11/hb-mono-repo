import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CountryCode, CurrencyCode } from '@hb/shared';

/**
 * Append-only global shipping-fee history, keyed on (effectiveFrom, route,
 * currency) — mirrors CommissionRate's append-only shape (VE-1), extended
 * with a route dimension. A route is an origin→destination country pair;
 * `CountryCode` has exactly two members so there are exactly 4 routes
 * (ZA→ZA, ZA→NA, NA→NA, NA→ZA), all of them configurable — NA→ZA included
 * because `orders.originCountry` is derived from `product.originCountry`
 * and can legitimately be NA.
 *
 * Never update or delete a row — the fee in force for a given route and
 * currency at any moment is the row with the greatest
 * `effectiveFrom <= t` for that exact (originCountry, destinationCountry,
 * currency) triple (see ShippingFeeService.getFeeAt). Changing "the" fee is
 * done by inserting a new 8-row set with a later `effectiveFrom`, not by
 * mutating existing rows, so past orders' resolved fees never shift
 * retroactively.
 */
@Entity('shipping_fees')
@Index(['originCountry', 'destinationCountry', 'currency', 'effectiveFrom'])
export class ShippingFee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The flat fee, in `currency`.
   *  NOTE: numeric columns come back as strings from the pg driver — always
   *  coerce with Number(...) at the service boundary before returning a DTO. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: CurrencyCode, enumName: 'currency_code' })
  currency: CurrencyCode;

  @Column({ type: 'enum', enum: CountryCode, enumName: 'country_code' })
  originCountry: CountryCode;

  @Column({ type: 'enum', enum: CountryCode, enumName: 'country_code' })
  destinationCountry: CountryCode;

  /** Timestamp from which this fee applies. */
  @Column({ type: 'timestamptz' })
  effectiveFrom: Date;

  /** Optional free-text context for why the fee changed. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  /** The admin user who created this row, if known. */
  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
