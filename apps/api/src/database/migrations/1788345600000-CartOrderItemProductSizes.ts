import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wires `product_sizes` (card SZihvfYb) into cart lines and order lines
 * (card pxOYnZNI — Product Sizing: cart size selection, inventory-safe
 * checkout).
 *
 * `cart_items.productSizeId`: nullable FK, `ON DELETE SET NULL` — a cart
 * line for a since-deleted size falls back to the unsized/Product path
 * (clamp/vanish per the spec's out-of-scope note) rather than hard-failing.
 *
 * `order_items.productSizeId` + `order_items.sizeLabel`: the FK is nullable/
 * `ON DELETE SET NULL` mirroring the existing `order_items.productId`
 * pattern — deleting a size must never break a past order. `sizeLabel` is
 * the actual historical snapshot (same style as the existing `productName`
 * column) — the FK is only a live reference for as long as the size row
 * survives.
 */
export class CartOrderItemProductSizes1788345600000 implements MigrationInterface {
  name = 'CartOrderItemProductSizes1788345600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cart_items" ADD COLUMN "productSizeId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "FK_cart_items_productSize"
        FOREIGN KEY ("productSizeId") REFERENCES "product_sizes"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_cart_items_productSizeId" ON "cart_items" ("productSizeId")
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items" ADD COLUMN "productSizeId" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items" ADD COLUMN "sizeLabel" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD CONSTRAINT "FK_order_items_productSize"
        FOREIGN KEY ("productSizeId") REFERENCES "product_sizes"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_items_productSizeId" ON "order_items" ("productSizeId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_order_items_productSizeId"`);
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_productSize"`,
    );
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "sizeLabel"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "productSizeId"`);

    await queryRunner.query(`DROP INDEX "IDX_cart_items_productSizeId"`);
    await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "FK_cart_items_productSize"`);
    await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN "productSizeId"`);
  }
}
