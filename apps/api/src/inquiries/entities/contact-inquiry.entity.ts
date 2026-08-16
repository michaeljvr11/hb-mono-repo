import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { InquiryOrderType } from '@hb/shared';

/**
 * A contact-form submission (LSM-5). Persisted first, notified second — see
 * InquiriesService — so a Resend outage never loses a lead. No user
 * relation: submitters are anonymous, unauthenticated visitors, and the row
 * is never updated after creation (no UpdateDateColumn).
 */
@Entity('contact_inquiries')
export class ContactInquiry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 255 })
  email: string;

  @Column({ length: 50, nullable: true })
  phone?: string;

  @Column({
    type: 'enum',
    enum: InquiryOrderType,
    enumName: 'inquiry_order_type',
  })
  orderType: InquiryOrderType;

  @Column({ length: 100, nullable: true })
  referenceNumber?: string;

  @Column({ length: 5000 })
  message: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
