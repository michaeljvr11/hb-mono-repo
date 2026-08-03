import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the append-only commission_rates table (VE-1 spec — "Vendor
 * Earnings & Commission"). The applicable rate for any moment in time is the
 * row with the greatest effectiveFrom <= t; rows are never updated or
 * deleted after creation, only appended, so a rate change never silently
 * restates past order lines' resolved earnings.
 *
 * Seeds the current 15.00% rate effective from the earliest existing order's
 * createdAt (so any orders placed before this migration ran are still
 * covered by the seed row), or from the epoch if there are no orders yet.
 * Uses a raw SELECT + INSERT so this succeeds against both an empty and a
 * populated dev/prod database.
 */
export class CommissionRates1784419200000 implements MigrationInterface {
  name = 'CommissionRates1784419200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "commission_rates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "ratePercent" numeric(5,2) NOT NULL,
        "effectiveFrom" TIMESTAMP WITH TIME ZONE NOT NULL,
        "note" character varying,
        "createdByUserId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_commission_rates" PRIMARY KEY ("id")
      )
    `);

    // UNIQUE (not just indexed): two concurrent admin inserts can both read the
    // same "latest" row and both pass the service-layer strictly-after check
    // before either commits. The unique constraint is the actual guarantee that
    // the history stays monotonically ordered; CommissionRateService.create()
    // catches the resulting pg unique-violation (23505) and rethrows it as the
    // same ConflictException the read-then-write check already throws.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_commission_rates_effectiveFrom" ON "commission_rates" ("effectiveFrom")`,
    );

    const earliestOrder = (await queryRunner.query(
      `SELECT MIN("createdAt") AS min FROM "orders"`,
    )) as Array<{ min: string | null }>;
    const seedEffectiveFrom = earliestOrder[0]?.min ?? '1970-01-01T00:00:00.000Z';

    await queryRunner.query(
      `INSERT INTO "commission_rates" ("ratePercent", "effectiveFrom", "note")
       VALUES ($1, $2, $3)`,
      [15.0, seedEffectiveFrom, 'Initial platform commission rate (provisional)'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_commission_rates_effectiveFrom"`);
    await queryRunner.query(`DROP TABLE "commission_rates"`);
  }
}
