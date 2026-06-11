import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CountryCode } from '@hb/shared';
import { User } from '../../users/entities/user.entity';

/**
 * Delivery/billing address. countryCode is the seam that decides whether an
 * order is domestic (ZA) or cross-border (ZA → NA).
 */
@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column()
  recipientName: string;

  @Column()
  line1: string;

  @Column({ nullable: true })
  line2?: string;

  @Column()
  city: string;

  @Column({ nullable: true })
  region?: string; // province (ZA) / region (NA)

  @Column({ nullable: true })
  postalCode?: string;

  @Column({
    type: 'enum',
    enum: CountryCode,
    enumName: 'country_code',
  })
  countryCode: CountryCode;

  @Column({ nullable: true })
  phone?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
