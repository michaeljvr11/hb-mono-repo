import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds indexes on `orders."createdAt"` and `order_items."vendorId"` (card
 * EDR-1, vault: "Earnings Date-Range Filtering", resolved 2026-08-11).
 *
 * Every earnings query (`VendorEarningsService.getEarnings`/
 * `getEarningsByVendor`, `AdminEarningsService.getPlatformListingGmv`) bounds
 * strictly on `orders."createdAt" BETWEEN :from AND :to` and filters
 * `order_items."vendorId"` (`IS NOT NULL` or `= :vendorId`), with neither
 * column previously indexed. That was tolerable while every window was a
 * narrow rolling/calendar-month preset; EDR-1 adds `window: 'all'` (full
 * history, epoch sentinel through now) and an arbitrary custom `[from, to]`
 * range, both of which can now scan the entire table — this is exactly the
 * point where the missing indexes start to hurt.
 *
 * Uses a plain `CREATE INDEX`, not `CREATE INDEX CONCURRENTLY`: TypeORM runs
 * each migration inside a transaction, and `CONCURRENTLY` cannot run inside
 * one (Postgres rejects it). A plain `CREATE INDEX` takes a SHARE lock on the
 * target table for the duration of the build — reads continue, writes block
 * until it completes. At current data volume (dev/early-prod, low order
 * counts) that blocking window is short and acceptable; if `orders`/
 * `order_items` grow large enough for this to matter in production, revisit
 * with an out-of-transaction `CONCURRENTLY` build (e.g. a one-off script, not
 * a standard migration) rather than reflexively reaching for it here.
 */
export class EarningsRangeIndexes1786665600000 implements MigrationInterface {
  name = 'EarningsRangeIndexes1786665600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX "IDX_orders_createdAt" ON "orders" ("createdAt")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_order_items_vendorId" ON "order_items" ("vendorId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_order_items_vendorId"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_createdAt"`);
  }
}
