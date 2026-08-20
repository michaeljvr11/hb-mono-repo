import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds intrinsic pixel dimensions + original upload size to `product_images`
 * (Trello PIO-1, vault: "Product Image Optimization Pipeline" spec, "Decisions
 * locked — 2026-08-18"). Metadata-probe-only slice — no resizing/derivatives yet
 * (that lands in PIO-2), so these are the only new columns.
 *
 * All three are nullable: legacy rows predating this probe are never backfilled
 * (locked decision) and must keep serialising/rendering with nulls.
 */
export class ProductImageDimensions1787184000000 implements MigrationInterface {
  name = 'ProductImageDimensions1787184000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_images"
        ADD COLUMN "width" integer,
        ADD COLUMN "height" integer,
        ADD COLUMN "sizeBytes" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_images"
        DROP COLUMN "sizeBytes",
        DROP COLUMN "height",
        DROP COLUMN "width"
    `);
  }
}
