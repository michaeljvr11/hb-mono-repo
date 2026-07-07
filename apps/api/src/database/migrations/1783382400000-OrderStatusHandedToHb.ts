import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the 'handed_to_hb' order state (Order State Machine, 2026-06-18):
 * the moment a vendor physically delivers their goods to HB for cross-border
 * onward shipment. Sits between 'processing' and 'shipped'.
 *
 * PG16 allows ALTER TYPE ... ADD VALUE inside a transaction as long as the
 * new value is not used in the same transaction (it isn't).
 */
export class OrderStatusHandedToHb1783382400000 implements MigrationInterface {
  name = 'OrderStatusHandedToHb1783382400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'handed_to_hb' AFTER 'processing'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Removing an enum value requires rebuilding the type. Any order already
    // handed to HB falls back to 'processing' (the previous state).
    await queryRunner.query(
      `UPDATE "orders" SET "status" = 'processing' WHERE "status" = 'handed_to_hb'`,
    );
    await queryRunner.query(`ALTER TYPE "order_status" RENAME TO "order_status_old"`);
    await queryRunner.query(
      `CREATE TYPE "order_status" AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" TYPE "order_status" USING "status"::text::"order_status"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending'`);
    await queryRunner.query(`DROP TYPE "order_status_old"`);
  }
}
