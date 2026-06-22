import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The user who performed the action, or null for system-initiated events. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** Action key in dot notation, e.g. `vendor.status_changed`. */
  @Index()
  @Column()
  action: string;

  /** Domain entity type the action was performed on, e.g. `vendor`, `user`, `product`. */
  @Index()
  @Column()
  entityType: string;

  /** Database identifier of the affected entity. */
  @Column()
  entityId: string;

  /** Optional structured context about the action. */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
