import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `order_items.commissionRatePercent` (nullable numeric(5,2)) — the
 * commission-rate snapshot at order-creation time (VE-3 spec — "Vendor
 * Earnings & Commission", data model point 2). Mirrors the existing
 * `unitPrice`/`productName` snapshot pattern on this table: a later change to
 * `commission_rates` must never retroactively restate an already-placed
 * line's earnings.
 *
 * Platform lines (`vendorId IS NULL`) carry no commission — there is no
 * vendor to charge a fee to — so they stay `NULL`. Backfill for existing
 * vendor lines resolves the effective-dated rate via a correlated subquery
 * that mirrors `CommissionRateService.getRateAt`'s semantics: the latest
 * `commission_rates` row whose `effectiveFrom <= order.createdAt`. A flat
 * "15.00% for everyone" backfill would be wrong on any database where an
 * admin has since scheduled a different rate (VE-1's effective-dated
 * history + VE-2's admin UI) — this restates historical lines under
 * whatever rate was actually in force on their order's creation date,
 * exactly the snapshot-at-order-time guarantee this migration exists to
 * preserve.
 */
export class OrderItemCommissionRatePercent1784592000000 implements MigrationInterface {
  name = 'OrderItemCommissionRatePercent1784592000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" ADD "commissionRatePercent" numeric(5,2)`);

    await queryRunner.query(`
      UPDATE "order_items" oi
      SET "commissionRatePercent" = (
        SELECT cr."ratePercent"
        FROM "commission_rates" cr
        JOIN "orders" o ON o.id = oi."orderId"
        WHERE cr."effectiveFrom" <= o."createdAt"
        ORDER BY cr."effectiveFrom" DESC
        LIMIT 1
      )
      WHERE oi."vendorId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "commissionRatePercent"`);
  }
}
