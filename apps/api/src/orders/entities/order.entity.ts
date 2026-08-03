import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CountryCode, CurrencyCode, OrderStatus } from '@hb/shared';
import { User } from '../../users/entities/user.entity';
import { Address } from '../../addresses/entities/address.entity';
import { OrderItem } from './order-item.entity';

/**
 * Order header. origin/destination country pair is the cross-border seam:
 * ZA → ZA is domestic, ZA → NA goes through the customs/shipping leg.
 * Amounts are denormalised totals in the order's currency (NAD pegged 1:1
 * to ZAR, but stored explicitly — never assumed).
 */
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({
    type: 'enum',
    enum: CurrencyCode,
    enumName: 'currency_code',
    default: CurrencyCode.ZAR,
  })
  currency: CurrencyCode;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  shippingTotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({
    type: 'enum',
    enum: CountryCode,
    enumName: 'country_code',
    default: CountryCode.SOUTH_AFRICA,
  })
  originCountry: CountryCode;

  @Column({
    type: 'enum',
    enum: CountryCode,
    enumName: 'country_code',
  })
  destinationCountry: CountryCode;

  @ManyToOne(() => Address, { nullable: true })
  @JoinColumn({ name: 'shippingAddressId' })
  shippingAddress?: Address;

  @Column({ nullable: true })
  shippingAddressId?: string;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  /**
   * Stamped exactly once, in `OrdersService.updateStatus` on the
   * `shipped → delivered` transition (vault: "Vendor Earnings & Commission").
   * The 48h damage-claim window used for payout eligibility is derived from
   * this (`deliveredAt + DAMAGE_CLAIM_WINDOW_HOURS`), never stored separately.
   * Order-level for v1 — per-shipment delivery is a listed TBD.
   */
  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt?: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
