import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { OrderStatus } from '@hb/shared';

/**
 * Audit row for the admin any-state override path (`OrdersService.overrideStatus`).
 * Dedicated table, separate from the generic `audit_logs` (`AuditService`) —
 * written unconditionally on every override, regardless of `sendNotifications`.
 */
@Entity('order_status_overrides')
export class OrderStatusOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'uuid' })
  adminUserId: string;

  @Column({ type: 'enum', enum: OrderStatus, enumName: 'order_status' })
  fromStatus: OrderStatus;

  @Column({ type: 'enum', enum: OrderStatus, enumName: 'order_status' })
  toStatus: OrderStatus;

  @Column({ type: 'varchar', length: 2000 })
  reason: string;

  @Column({ type: 'boolean' })
  sendNotifications: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
