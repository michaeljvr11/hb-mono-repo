import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { CountryCode, VendorProfileSection, VendorStatus } from '@hb/shared';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

@Entity('vendors')
export class Vendor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  businessName: string;

  @Column({ nullable: true })
  tradingName?: string;

  @Column({ nullable: true })
  registrationNumber?: string; // CIPC (ZA) / BIPA (NA) registration

  @Column({ nullable: true })
  website?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: VendorStatus,
    enumName: 'vendor_status',
    default: VendorStatus.PENDING,
  })
  status: VendorStatus;

  /** Vendors can operate from either side of the border. */
  @Column({
    type: 'enum',
    enum: CountryCode,
    enumName: 'country_code',
    default: CountryCode.SOUTH_AFRICA,
  })
  countryCode: CountryCode;

  @Column({ nullable: true })
  verificationDocumentUrl?: string; // proof of business

  @Column({ nullable: true })
  logoUrl?: string;

  @Column({ nullable: true })
  bannerUrl?: string;

  @Column({ nullable: true })
  slogan?: string;

  @Column({ type: 'jsonb', nullable: true })
  profileSections?: VendorProfileSection[];

  // Vendor-portal override for where TE-4 sends order/transactional notifications.
  // NULL means "use the account email" (this.user.email) — resolved by
  // VendorsService.resolveNotificationEmail(). Format-validated only (@IsEmail
  // on the DTO); not reused with the account's isVerified machinery.
  @Column({ type: 'varchar', nullable: true })
  notificationEmail?: string | null;

  // The User account that owns/manages this vendor
  @OneToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userId?: string;

  @OneToMany(() => Product, (product) => product.vendor)
  products: Product[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
