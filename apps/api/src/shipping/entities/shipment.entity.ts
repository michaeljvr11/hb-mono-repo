import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CountryCode, ShipmentStatus } from '@hb/shared';
import { Order } from '../../orders/entities/order.entity';

/**
 * One physical delivery for an order. from/to country pair plus
 * customsReference model the ZA → NA cross-border leg structurally
 * without committing to any courier integration.
 */
@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, { nullable: false })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  orderId: string;

  /** Provider key ('stub' until a courier is chosen). */
  @Column({ default: 'stub' })
  provider: string;

  @Column({ nullable: true })
  trackingReference?: string;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    enumName: 'shipment_status',
    default: ShipmentStatus.PENDING,
  })
  status: ShipmentStatus;

  @Column({
    type: 'enum',
    enum: CountryCode,
    enumName: 'country_code',
    default: CountryCode.SOUTH_AFRICA,
  })
  fromCountry: CountryCode;

  @Column({
    type: 'enum',
    enum: CountryCode,
    enumName: 'country_code',
  })
  toCountry: CountryCode;

  /** Customs/clearance reference for cross-border shipments. */
  @Column({ nullable: true })
  customsReference?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
