import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@hb/shared';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: false })
  email: string;

  @Column({ nullable: false })
  password: string; // hashed via @BeforeInsert

  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role',
    default: UserRole.CUSTOMER,
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  // Email confirmation: not required to browse, required to place orders
  // (see Auth & Roles note). Set false on register; flipped by /auth/verify-email.
  @Column({ default: false })
  isVerified: boolean;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ nullable: true })
  currentRefreshToken?: string;

  @Column({ type: 'timestamptz', nullable: true })
  currentRefreshTokenExp?: Date;

  // Password reset + email verification: we store a SHA-256 hash of the raw
  // token (the raw value only ever lives in the emailed link), so a leaked DB
  // row can't be replayed. Lookups hash the incoming token and match the hash.
  @Column({ nullable: true })
  passwordResetTokenHash?: string;

  @Column({ type: 'timestamptz', nullable: true })
  passwordResetExpires?: Date;

  @Column({ nullable: true })
  emailVerificationTokenHash?: string;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerificationExpires?: Date;

  /**
   * When this account accepted the Terms of Service and Privacy Policy (LC-10).
   *
   * Written in the SAME insert as the account row, so an account cannot exist
   * without its acceptance timestamp: if the write fails, registration fails.
   * The `user.terms_accepted` audit entry still records *which* documents were
   * accepted, but it is no longer the only evidence — `AuditService.log` is
   * best-effort by design and swallows its own errors, which is right for
   * telemetry and too weak for a consent record.
   *
   * Nullable, and null means exactly one thing: this account predates the
   * consent capture, or was created on a path that does not capture it. It is
   * never "accepted but unknown when".
   */
  @Column({ type: 'timestamptz', nullable: true })
  termsAcceptedAt?: Date | null;

  @BeforeInsert()
  async hashPassword() {
    this.password = await bcrypt.hash(this.password, 12);
  }
}
