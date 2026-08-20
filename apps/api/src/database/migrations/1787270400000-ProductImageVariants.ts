import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the responsive-derivative set to `product_images` (Trello PIO-2, vault: "Product
 * Image Optimization Pipeline" spec, "Decisions locked — 2026-08-18"). Every uploaded
 * product image now produces a fixed `thumbnail`/`card`/`full` WebP derivative set at
 * upload time (see `apps/api/src/common/image-processing/`); `variants` stores the URL +
 * dimensions + byte size of each derivative actually generated.
 *
 * Nullable jsonb, same rationale as `Vendor.profileSections` (fixed, small, always-read-
 * together blob owned entirely by the pipeline). Legacy rows predating this slice are
 * never backfilled (locked decision) and keep `variants` null — every consumer falls back
 * to `url` alone.
 */
export class ProductImageVariants1787270400000 implements MigrationInterface {
  name = 'ProductImageVariants1787270400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_images"
        ADD COLUMN "variants" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_images"
        DROP COLUMN "variants"
    `);
  }
}
