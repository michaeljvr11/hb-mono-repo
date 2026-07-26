import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds vendor branding + profile-sections columns (VPC-1 spec). All 4 columns are
 * nullable — no backfill needed. "profileSections" is a jsonb blob (v1 storage; not
 * a relational table) holding an ordered array of curated/category section objects
 * as defined by VendorProfileSection in @hb/shared.
 */
export class VendorBrandingSections1784332800000 implements MigrationInterface {
  name = 'VendorBrandingSections1784332800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors"
      ADD "logoUrl" character varying,
      ADD "bannerUrl" character varying,
      ADD "slogan" character varying,
      ADD "profileSections" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors"
      DROP COLUMN "profileSections",
      DROP COLUMN "slogan",
      DROP COLUMN "bannerUrl",
      DROP COLUMN "logoUrl"
    `);
  }
}
