import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Product Reviews & Ratings, PR-1 (Trello 4loUsIJ7, vault: "Product Reviews & Ratings").
 * One review per (product, user) — the UNIQUE constraint is the DB-level backstop for
 * "already reviewed" (enforced again at the service layer in PR-2). No denormalised
 * average/count columns on `products`: `averageRating`/`reviewCount` are always a SQL
 * aggregate at read time (see ReviewsService.findAllForProduct) so they can never drift.
 */
export class ProductReviews1787511964625 implements MigrationInterface {
  name = 'ProductReviews1787511964625';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_reviews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "productId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "rating" smallint NOT NULL,
        "body" text NOT NULL,
        "isVerifiedPurchase" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_product_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5),
        CONSTRAINT "UQ_product_reviews_product_user" UNIQUE ("productId", "userId"),
        CONSTRAINT "FK_product_reviews_product" FOREIGN KEY ("productId")
          REFERENCES "products" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_reviews_user" FOREIGN KEY ("userId")
          REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_reviews_product_created"
        ON "product_reviews" ("productId", "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_product_reviews_product_created"`);
    await queryRunner.query(`DROP TABLE "product_reviews"`);
  }
}
