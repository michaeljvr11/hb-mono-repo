import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the singleton `platform_settings` table (TE-2 spec: "Transactional
 * Email & Order Notifications"). Deliberately typed columns on a single row —
 * NOT a generic key/value bag, and NOT the append-only history pattern
 * `commission_rates` uses (no historical resolution needed here). Kept
 * narrow/generic so future platform settings land as new columns.
 *
 * `notificationEmails` is a jsonb array (repo precedent:
 * `vendors.profileSections`, migration 1784332800000) defaulting to `'[]'`,
 * so a never-configured install returns an empty array instead of null.
 *
 * The row itself is seeded here so the service never has to special-case a
 * missing row for the common read path — belt-and-braces with the service
 * layer also tolerating zero rows (TE-4 requires "no row yet" to be a
 * skip-and-warn, never a throw).
 */
export class PlatformSettings1786752000000 implements MigrationInterface {
  name = 'PlatformSettings1786752000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "platform_settings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "notificationEmails" jsonb NOT NULL DEFAULT '[]',
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedByUserId" uuid,
        CONSTRAINT "PK_platform_settings" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "platform_settings" ("notificationEmails")
      VALUES ('[]')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "platform_settings"`);
  }
}
