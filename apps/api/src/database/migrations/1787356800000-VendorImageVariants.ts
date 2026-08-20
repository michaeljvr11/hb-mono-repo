import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the same intrinsic-dimensions + derivative-set columns to `vendors` that
 * `ProductImageDimensions`/`ProductImageVariants` added to `product_images` (Trello
 * PIO-5, vault: "Product Image Optimization Pipeline", "PIO-4 design output —
 * 2026-08-18"). Vendor logo/banner uploads now run through the same
 * `ImageProcessorService` pipeline as product images, with their own preset sets — see
 * `apps/api/src/vendors/upload/vendor-image.presets.ts`.
 *
 * The entity stays flat (`logoWidth`/`logoHeight`/`logoSizeBytes`/`logoVariants`, same
 * for banner) — the nested `VendorDto.logo`/`banner` shape is a DTO decision only, not a
 * schema one.
 *
 * All eight columns are nullable: legacy vendors with only `logoUrl`/`bannerUrl` set (no
 * dimensions/variants) are never backfilled and must keep working — the mapping layer
 * treats a null width/height/sizeBytes as "no `logo`/`banner` metadata to nest".
 */
export class VendorImageVariants1787356800000 implements MigrationInterface {
  name = 'VendorImageVariants1787356800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors"
        ADD COLUMN "logoWidth" integer,
        ADD COLUMN "logoHeight" integer,
        ADD COLUMN "logoSizeBytes" integer,
        ADD COLUMN "logoVariants" jsonb,
        ADD COLUMN "bannerWidth" integer,
        ADD COLUMN "bannerHeight" integer,
        ADD COLUMN "bannerSizeBytes" integer,
        ADD COLUMN "bannerVariants" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "vendors"
        DROP COLUMN "bannerVariants",
        DROP COLUMN "bannerSizeBytes",
        DROP COLUMN "bannerHeight",
        DROP COLUMN "bannerWidth",
        DROP COLUMN "logoVariants",
        DROP COLUMN "logoSizeBytes",
        DROP COLUMN "logoHeight",
        DROP COLUMN "logoWidth"
    `);
  }
}
