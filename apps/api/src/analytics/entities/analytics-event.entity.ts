import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AnalyticsEventType, CurrencyCode } from '@hb/shared';

/**
 * Bespoke first-party analytics event stream (funnel: product_viewed →
 * add_to_cart → checkout_started → shipping_submitted →
 * payment_attempted/payment_failed → order_completed).
 *
 * Deliberately NO FK relations — bare uuid columns only — so events survive
 * product/order/vendor deletion and this table is never join-loaded from the
 * OLTP path. NO PII columns: `sessionId` is a client-minted anonymous UUID;
 * `userId` is reserved for a later authenticated-attribution slice and is
 * always null today (see @hb/shared contracts/analytics.ts).
 */
@Entity('analytics_events')
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  type: AnalyticsEventType;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  sessionId: string;

  /** Reserved for later authenticated attribution; always null in this slice. */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  vendorId: string | null;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  value: number | null;

  @Column({
    type: 'enum',
    enum: CurrencyCode,
    enumName: 'currency_code',
    nullable: true,
  })
  currency: CurrencyCode | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  /** Client clock — when the event actually happened. */
  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  /** Server clock — when HB received the event. */
  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt: Date;
}
