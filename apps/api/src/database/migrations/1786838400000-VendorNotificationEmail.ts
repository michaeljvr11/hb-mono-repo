import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a nullable vendor-configurable notification-email override (TE-3).
 * NULL means "use the vendor's account email" (vendor.user.email) — resolved
 * at read time by VendorsService.resolveNotificationEmail(), which also
 * handles the userless-admin-created-vendor edge case (no override, no user
 * → no recipient). No backfill needed; the override stays genuinely optional.
 */
export class VendorNotificationEmail1786838400000 implements MigrationInterface {
  name = 'VendorNotificationEmail1786838400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors"
      ADD "notificationEmail" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors"
      DROP COLUMN "notificationEmail"
    `);
  }
}
