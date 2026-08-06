import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `orders.deliveredAt` (nullable timestamptz) — the payout-eligibility
 * clock's anchor point (VE-3 spec — "Vendor Earnings & Commission", data
 * model point 1). Stamped exactly once, in `OrdersService.updateStatus` on
 * the `shipped → delivered` transition; the 48h damage-claim window is
 * derived from it, never stored separately.
 *
 * Backfill: orders that are already `delivered` (pre-existing dev/prod rows)
 * get `deliveredAt = updatedAt` as the best available approximation, so this
 * migration is safe against a non-empty database.
 */
export class OrderDeliveredAt1784505600000 implements MigrationInterface {
  name = 'OrderDeliveredAt1784505600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD "deliveredAt" TIMESTAMP WITH TIME ZONE`);

    await queryRunner.query(
      `UPDATE "orders" SET "deliveredAt" = "updatedAt" WHERE "status" = 'delivered'`,
    );

    await queryRunner.query(`CREATE INDEX "IDX_orders_deliveredAt" ON "orders" ("deliveredAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_orders_deliveredAt"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "deliveredAt"`);
  }
}
