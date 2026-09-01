import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `product_sizes` (Product Sizing spec) — an opt-in, per-product list
 * of sizes with **real per-size stock** (a child entity/table, not a label
 * array on `Product`; decision confirmed with the product owner). Zero rows
 * for a product ⇒ unchanged legacy behaviour driven by `products.stockQuantity`.
 *
 * `displayOrder` is vendor-controlled, never auto-sorted — the UI renders in
 * that order everywhere (PDP, cart, order lines). Label uniqueness-per-product
 * is enforced in `ProductsService` (cross-row check, mirrors the existing
 * `categoryIds` existence check), not a DB constraint, matching that
 * precedent — no completeness/uniqueness constraint at this layer.
 *
 * Cascade delete: a size belongs to exactly one product; deleting the
 * product deletes its sizes. Nothing else references `product_sizes` yet —
 * the `order_items.productSizeId` FK is a later card (pxOYnZNI).
 */
export class ProductSizes1788259200000 implements MigrationInterface {
  name = 'ProductSizes1788259200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_sizes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "productId" uuid NOT NULL,
        "label" character varying NOT NULL,
        "stockQuantity" integer NOT NULL,
        "displayOrder" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_product_sizes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_sizes_product"
          FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_product_sizes_productId" ON "product_sizes" ("productId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_product_sizes_productId"`);
    await queryRunner.query(`DROP TABLE "product_sizes"`);
  }
}
