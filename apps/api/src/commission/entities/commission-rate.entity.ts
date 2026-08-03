import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Append-only commission rate history. Never update or delete a row — the
 * applicable rate at any moment is the row with the greatest
 * `effectiveFrom <= t` (see CommissionRateService.getRateAt). Changing "the"
 * rate is done by inserting a new row with a later `effectiveFrom`, not by
 * mutating an existing one, so past order lines' resolved rates never shift
 * retroactively.
 */
@Entity('commission_rates')
export class CommissionRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Platform commission, 0-100, 2 decimal places (e.g. 15.00 = 15%).
   *  NOTE: numeric columns come back as strings from the pg driver — always
   *  coerce with Number(...) at the service boundary before returning a DTO. */
  @Column({ type: 'numeric', precision: 5, scale: 2 })
  ratePercent: number;

  /** Timestamp from which this rate applies. */
  @Index()
  @Column({ type: 'timestamptz' })
  effectiveFrom: Date;

  /** Optional free-text context for why the rate changed. */
  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  /** The admin user who created this row, if known. */
  @Column({ type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
