import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the append-only shipping_fees table (SF-1, vault: "Configurable
 * Shipping Fee" — the flat-fee-per-currency data model in that note is
 * superseded by the route decision resolved 2026-08-24: the fee is keyed on
 * (effectiveFrom, route, currency), not (effectiveFrom, currency)).
 *
 * A route is an origin -> destination country pair. The existing
 * "country_code" pg enum has exactly two members (ZA, NA), so there are
 * exactly 4 routes: ZA->ZA, ZA->NA, NA->NA, NA->ZA — all four configurable.
 * NA->ZA is deliberately included: orders.originCountry is derived from
 * product.originCountry and can legitimately be NA, so a NA->ZA order is
 * representable today and must never resolve to a guessed fee.
 *
 * The applicable fee for a given route+currency at any moment is the row
 * with the greatest effectiveFrom <= t for that exact (originCountry,
 * destinationCountry, currency) triple; rows are never updated or deleted
 * after creation, only appended (mirrors commission_rates, 1784419200000).
 *
 * Reuses the existing "country_code" and "currency_code" pg enum types
 * (created by 1781136000000-InitialSchema) rather than creating new ones.
 *
 * Seeds a full covering set — all 4 routes x 2 currencies = 8 rows — at
 * amount 0.00, effective from the earliest existing order's createdAt (so
 * any orders placed before this migration ran are still covered by the
 * seed), or from the epoch if there are no orders yet. 0.00 is
 * behaviour-neutral: identical to today's hardcoded-zero shippingTotal,
 * until an admin sets real amounts. Uses a raw SELECT + INSERT so this
 * succeeds against both an empty and a populated dev/prod database.
 */
export class ShippingFees1788000000000 implements MigrationInterface {
  name = 'ShippingFees1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shipping_fees" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "amount" numeric(12,2) NOT NULL,
        "currency" "currency_code" NOT NULL,
        "originCountry" "country_code" NOT NULL,
        "destinationCountry" "country_code" NOT NULL,
        "effectiveFrom" TIMESTAMP WITH TIME ZONE NOT NULL,
        "note" character varying(500),
        "createdByUserId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shipping_fees" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shipping_fees_effectiveFrom_route_currency"
          UNIQUE ("effectiveFrom", "originCountry", "destinationCountry", "currency")
      )
    `);

    // Resolution index: getFeeAt filters on the exact route+currency triple
    // and orders by effectiveFrom DESC to find the greatest one <= a date.
    await queryRunner.query(`
      CREATE INDEX "IDX_shipping_fees_route_currency_effectiveFrom"
        ON "shipping_fees" ("originCountry", "destinationCountry", "currency", "effectiveFrom")
    `);

    const earliestOrder = (await queryRunner.query(
      `SELECT MIN("createdAt") AS min FROM "orders"`,
    )) as Array<{ min: string | null }>;
    const seedEffectiveFrom = earliestOrder[0]?.min ?? '1970-01-01T00:00:00.000Z';

    await queryRunner.query(
      `INSERT INTO "shipping_fees"
         ("amount", "currency", "originCountry", "destinationCountry", "effectiveFrom", "note")
       VALUES
         (0.00, 'ZAR', 'ZA', 'ZA', $1, $2),
         (0.00, 'NAD', 'ZA', 'ZA', $1, $2),
         (0.00, 'ZAR', 'ZA', 'NA', $1, $2),
         (0.00, 'NAD', 'ZA', 'NA', $1, $2),
         (0.00, 'ZAR', 'NA', 'NA', $1, $2),
         (0.00, 'NAD', 'NA', 'NA', $1, $2),
         (0.00, 'ZAR', 'NA', 'ZA', $1, $2),
         (0.00, 'NAD', 'NA', 'ZA', $1, $2)`,
      [seedEffectiveFrom, 'Initial shipping fee (provisional, behaviour-neutral)'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_shipping_fees_route_currency_effectiveFrom"`);
    await queryRunner.query(`DROP TABLE "shipping_fees"`);
  }
}
