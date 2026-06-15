import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds email-verification + password-reset state to users.
 * - isVerified: email confirmation flag (required to place orders, not to browse).
 * - {passwordReset,emailVerification}TokenHash/Expires: SHA-256 hashes of the raw
 *   tokens (raw value only lives in the emailed link) plus their expiry windows.
 */
export class AuthVerificationAndReset1781740800000 implements MigrationInterface {
  name = 'AuthVerificationAndReset1781740800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "isVerified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "passwordResetTokenHash" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "passwordResetExpires" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "emailVerificationTokenHash" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "emailVerificationExpires" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailVerificationExpires"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailVerificationTokenHash"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "passwordResetExpires"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "passwordResetTokenHash"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isVerified"`);
  }
}
