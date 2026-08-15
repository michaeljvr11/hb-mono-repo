import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Singleton platform-wide settings row (TE-2 — "Transactional Email & Order
 * Notifications"). Typed columns, not a key/value bag: this table is
 * deliberately narrow, and future settings should land as new columns here
 * rather than as new rows or a generic value blob.
 *
 * The migration seeds exactly one row; the service reads "the first row" and
 * tolerates zero rows (never throws) so a never-configured install still
 * resolves to an empty `notificationEmails` array.
 */
@Entity('platform_settings')
export class PlatformSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Recipients for platform ops order-notification emails (consumed by TE-4). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  notificationEmails: string[];

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  /** The admin user who last updated this row, if known. */
  @Column({ type: 'uuid', nullable: true })
  updatedByUserId: string | null;
}
