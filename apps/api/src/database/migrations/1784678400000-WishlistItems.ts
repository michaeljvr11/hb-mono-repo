import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `wishlist_items` (WL-1 — "Product Wishlist"): a save-for-later
 * list of product refs per user. No money/quantity is stored here — the
 * wishlist is not a staging cart; price/stock/name/image are always
 * resolved LIVE from `products` at read time (see WishlistDto in
 * @hb/shared). `UNIQUE (userId, productId)` enforces "already wishlisted"
 * at the DB level so a double-tapped heart can never create duplicate rows,
 * even under a race — the service treats a unique-violation on insert as a
 * no-op and falls through to returning the current list.
 */
export class WishlistItems1784678400000 implements MigrationInterface {
  name = 'WishlistItems1784678400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wishlist_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "productId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wishlist_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wishlist_items_userId_productId" UNIQUE ("userId", "productId"),
        CONSTRAINT "FK_wishlist_items_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_wishlist_items_product" FOREIGN KEY ("productId")
          REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_wishlist_items_userId" ON "wishlist_items" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_wishlist_items_userId"`);
    await queryRunner.query(`DROP TABLE "wishlist_items"`);
  }
}
