import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `product_shipping_fee_overrides` (SF-5, vault: "Configurable
 * Shipping Fee" → "Per-product shipping fee override" section — the
 * (productId, currency) key described there is superseded by the route
 * decision resolved 2026-08-24: keyed on (productId, route, currency),
 * mirroring the global default's route dimension exactly).
 *
 * Unlike `shipping_fees` (SF-1, append-only/effective-dated), this table is
 * deliberately **mutable** — mirrors `products.price`. The amount actually
 * charged is frozen onto `orders.shippingTotal` at order-creation time
 * (SF-3), so historical order integrity never depends on this table having a
 * history; there is none, the current row IS the value.
 *
 * An override does NOT need to cover every (route, currency) combination —
 * the whole point is a targeted exception (e.g. pre-positioned NA stock
 * making NA->NA cheap) while every other combination falls back to the
 * global default. No completeness constraint here, unlike shipping_fees.
 *
 * Reuses the existing "country_code" and "currency_code" pg enum types
 * (created by 1781136000000-InitialSchema) rather than creating new ones.
 */
export class ProductShippingFeeOverrides1788086400000 implements MigrationInterface {
  name = 'ProductShippingFeeOverrides1788086400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_shipping_fee_overrides" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "productId" uuid NOT NULL,
        "originCountry" "country_code" NOT NULL,
        "destinationCountry" "country_code" NOT NULL,
        "currency" "currency_code" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedByUserId" uuid,
        CONSTRAINT "PK_product_shipping_fee_overrides" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_shipping_fee_overrides_product_route_currency"
          UNIQUE ("productId", "originCountry", "destinationCountry", "currency"),
        CONSTRAINT "FK_product_shipping_fee_overrides_product"
          FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "product_shipping_fee_overrides"`);
  }
}
